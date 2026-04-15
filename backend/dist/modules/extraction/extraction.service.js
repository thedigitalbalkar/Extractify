"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtractionService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const promises_1 = require("fs/promises");
const pdf = require("pdf-parse");
const pdf_img_convert_1 = require("pdf-img-convert");
const tesseract_js_1 = require("tesseract.js");
const extraction_result_schema_1 = require("./schemas/extraction-result.schema");
class CancelledExtractionError extends Error {
    constructor() {
        super("Extraction cancelled.");
    }
}
let ExtractionService = class ExtractionService {
    constructor(extractionResultModel) {
        this.extractionResultModel = extractionResultModel;
    }
    async processUpload(file) {
        if (!file) {
            throw new common_1.BadRequestException("Please upload a valid file.");
        }
        const allowedMimeTypes = [
            "application/pdf",
            "image/jpeg",
            "image/png",
        ];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new common_1.UnsupportedMediaTypeException("Only PDF, JPG, and PNG files are supported.");
        }
        const result = await this.extractionResultModel.create({
            originalFileName: file.originalname,
            storedFileName: file.filename,
            mimeType: file.mimetype,
            filePath: file.path,
            status: "queued",
            errorMessage: null,
            rawExtractedText: "",
            records: [],
            confidenceScore: 0,
            warnings: [],
            processedPages: 0,
            totalPages: 0,
        });
        void this.processQueuedUpload(result._id.toString());
        return this.toResponse(result);
    }
    async getResult(id) {
        const result = await this.extractionResultModel.findById(id).lean();
        if (!result) {
            throw new common_1.NotFoundException("Extraction result not found.");
        }
        return this.toResponse(result);
    }
    async cancelResult(id) {
        const result = await this.extractionResultModel.findById(id).lean();
        if (!result) {
            throw new common_1.NotFoundException("Extraction result not found.");
        }
        if (result.status === "completed" ||
            result.status === "failed" ||
            result.status === "cancelled") {
            return this.toResponse(result);
        }
        await this.cleanCancelledResult(id, result.filePath);
        const cancelled = await this.extractionResultModel.findById(id).lean();
        return this.toResponse(cancelled);
    }
    async cleanCancelledResult(id, filePath) {
        await this.extractionResultModel.findByIdAndUpdate(id, {
            status: "cancelled",
            errorMessage: "Extraction cancelled.",
            warnings: [],
            records: [],
            confidenceScore: 0,
            rawExtractedText: "",
            processedPages: 0,
            totalPages: 0,
        });
        if (filePath) {
            try {
                await (0, promises_1.unlink)(filePath);
            }
            catch { }
        }
    }
    async ensureNotCancelled(id) {
        const current = await this.extractionResultModel
            .findById(id)
            .select("status")
            .lean();
        if (current?.status === "cancelled") {
            throw new CancelledExtractionError();
        }
    }
    async processQueuedUpload(id) {
        const result = await this.extractionResultModel.findById(id);
        if (!result || result.status === "cancelled") {
            return;
        }
        await this.extractionResultModel.findByIdAndUpdate(id, {
            status: "processing",
            errorMessage: null,
            warnings: [],
            processedPages: 0,
            totalPages: 0,
        });
        try {
            await this.ensureNotCancelled(id);
            const extraction = await this.extractDocument({
                originalname: result.originalFileName,
                filename: result.storedFileName,
                mimetype: result.mimeType,
                path: result.filePath,
            }, id);
            await this.ensureNotCancelled(id);
            await this.extractionResultModel.findByIdAndUpdate(id, {
                status: "completed",
                errorMessage: null,
                rawExtractedText: extraction.rawExtractedText,
                records: extraction.records,
                confidenceScore: extraction.confidenceScore,
                warnings: extraction.warnings,
            });
        }
        catch (error) {
            if (error instanceof CancelledExtractionError) {
                await this.cleanCancelledResult(id, result.filePath);
                return;
            }
            const message = error instanceof Error
                ? error.message
                : "We could not process that file. Please retry with another document.";
            await this.extractionResultModel.findByIdAndUpdate(id, {
                status: "failed",
                errorMessage: message,
                warnings: [message],
                records: [],
                confidenceScore: 0,
            });
        }
    }
    async extractDocument(file, jobId) {
        await this.ensureNotCancelled(jobId);
        if (file.mimetype === "application/pdf") {
            const parsed = await pdf(await (0, promises_1.readFile)(file.path));
            await this.ensureNotCancelled(jobId);
            const parsedText = this.normalizeExtractedText(parsed.text || "");
            const parsedRecords = this.extractRecordsFromText(parsedText, 1, 1);
            if (parsedRecords.length && this.shouldTrustParsedPdfRecords(parsedRecords)) {
                await this.updatePartialProgress(jobId, parsedText, parsedRecords, 1, 1);
                return this.finalizeExtraction(parsedText, parsedRecords);
            }
        }
        return this.runOcrAndExtract(file, jobId);
    }
    async runOcrAndExtract(file, jobId) {
        const worker = await (0, tesseract_js_1.createWorker)("eng");
        await worker.setParameters({
            tessedit_pageseg_mode: tesseract_js_1.PSM.AUTO,
            preserve_interword_spaces: "1",
        });
        try {
            const rawTextParts = [];
            const records = [];
            let nextSeries = 1;
            if (file.mimetype === "application/pdf") {
                const pdfProfile = await this.detectPdfProfile(file.path, worker, jobId);
                const isTableProfile = pdfProfile === "table";
                await worker.setParameters({
                    tessedit_pageseg_mode: isTableProfile ? tesseract_js_1.PSM.SINGLE_BLOCK : tesseract_js_1.PSM.AUTO,
                    preserve_interword_spaces: "1",
                });
                const renderScale = isTableProfile ? 1.8 : 3.0;
                const pages = await (0, pdf_img_convert_1.convert)(file.path, { scale: renderScale });
                const totalPages = pages.length;
                await this.extractionResultModel.findByIdAndUpdate(jobId, {
                    totalPages,
                    processedPages: 0,
                });
                await this.ensureNotCancelled(jobId);
                for (let index = 0; index < pages.length; index += 1) {
                    await this.ensureNotCancelled(jobId);
                    const pageBuffer = Buffer.from(pages[index]);
                    const imageDimensions = this.getImageDimensions(pageBuffer);
                    const { data } = await worker.recognize(pageBuffer);
                    const normalizedText = this.normalizeExtractedText(data.text || "");
                    rawTextParts.push(normalizedText);
                    const pageRecords = await this.extractRecordsFromOcrPage(worker, pageBuffer, imageDimensions, (data.words || []), normalizedText, nextSeries, index + 1, jobId);
                    records.push(...pageRecords);
                    nextSeries += pageRecords.length;
                    await this.updatePartialProgress(jobId, rawTextParts.filter(Boolean).join("\n").trim(), records, index + 1, totalPages);
                }
            }
            else {
                await this.extractionResultModel.findByIdAndUpdate(jobId, {
                    totalPages: 1,
                    processedPages: 0,
                });
                await this.ensureNotCancelled(jobId);
                const imageBuffer = await (0, promises_1.readFile)(file.path);
                const imageDimensions = this.getImageDimensions(imageBuffer);
                const { data } = await worker.recognize(imageBuffer);
                const normalizedText = this.normalizeExtractedText(data.text || "");
                rawTextParts.push(normalizedText);
                const pageRecords = await this.extractRecordsFromOcrPage(worker, imageBuffer, imageDimensions, (data.words || []), normalizedText, nextSeries, 1, jobId);
                records.push(...pageRecords);
                await this.updatePartialProgress(jobId, rawTextParts.filter(Boolean).join("\n").trim(), records, 1, 1);
            }
            const rawExtractedText = rawTextParts.filter(Boolean).join("\n").trim();
            const fallbackRecords = records.length
                ? records
                : this.extractRecordsFromText(rawExtractedText, 1, 1);
            return this.finalizeExtraction(rawExtractedText, fallbackRecords);
        }
        finally {
            await worker.terminate();
        }
    }
    async updatePartialProgress(jobId, rawExtractedText, records, processedPages, totalPages) {
        const partialState = this.buildExtractionState(rawExtractedText, records, false);
        await this.extractionResultModel.findByIdAndUpdate(jobId, {
            rawExtractedText: partialState.rawExtractedText,
            records: partialState.records,
            confidenceScore: partialState.confidenceScore,
            warnings: partialState.warnings,
            processedPages,
            totalPages,
        });
    }
    getImageDimensions(image) {
        if (image.length >= 24 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47) {
            return {
                width: image.readUInt32BE(16),
                height: image.readUInt32BE(20),
            };
        }
        if (image.length >= 4 && image[0] === 0xff && image[1] === 0xd8) {
            let offset = 2;
            while (offset < image.length) {
                if (image[offset] !== 0xff) {
                    offset += 1;
                    continue;
                }
                const marker = image[offset + 1];
                if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 || marker === 0xc5 || marker === 0xc6 || marker === 0xc7 || marker === 0xc9 || marker === 0xca || marker === 0xcb || marker === 0xcd || marker === 0xce || marker === 0xcf) {
                    return {
                        height: image.readUInt16BE(offset + 5),
                        width: image.readUInt16BE(offset + 7),
                    };
                }
                if (marker === 0xd8 || marker === 0xd9) {
                    offset += 2;
                    continue;
                }
                const segmentLength = image.readUInt16BE(offset + 2);
                if (!segmentLength || segmentLength < 2) {
                    break;
                }
                offset += 2 + segmentLength;
            }
        }
        return {
            width: 2500,
            height: 3500,
        };
    }
    buildExtractionState(rawExtractedText, records, includeWarnings = true) {
        const validRecords = records.filter((record) => this.hasUsefulRecord(record));
        const filledFieldCount = validRecords.reduce((count, record) => {
            return (count +
                [
                    record.name && record.name !== "Deleted" ? record.name : null,
                    record.fatherName,
                    record.husbandName,
                    record.motherName,
                    record.otherName,
                ].filter(Boolean).length);
        }, 0);
        return {
            rawExtractedText,
            records: validRecords,
            confidenceScore: validRecords.length
                ? filledFieldCount / (validRecords.length * 5)
                : 0,
            warnings: includeWarnings
                ? validRecords.length
                    ? []
                    : [
                        "No person records with Name/Father/Husband/Mother/Others fields could be confidently extracted.",
                    ]
                : [],
        };
    }
    finalizeExtraction(rawExtractedText, records) {
        return this.buildExtractionState(rawExtractedText, records, true);
    }
    async extractRecordsFromOcrPage(worker, image, imageDimensions, words, normalizedText, startSeries, pageNumber, jobId) {
        const positionedWords = words.filter((word) => word.text &&
            /[a-z]/i.test(word.text) &&
            word.bbox &&
            typeof word.bbox.x0 === "number" &&
            typeof word.bbox.y0 === "number" &&
            typeof word.bbox.x1 === "number" &&
            typeof word.bbox.y1 === "number");
        const tableTextRecords = this.extractRecordsFromTableText(normalizedText, startSeries, pageNumber);
        if (tableTextRecords.length) {
            return tableTextRecords;
        }
        if (!positionedWords.length) {
            return this.extractRecordsFromText(normalizedText, startSeries, pageNumber);
        }
        const tableRecords = this.extractRecordsFromTablePage(positionedWords, normalizedText, startSeries, pageNumber);
        if (tableRecords.length) {
            return tableRecords;
        }
        const minX = Math.min(...positionedWords.map((word) => word.bbox.x0));
        const maxX = Math.max(...positionedWords.map((word) => word.bbox.x1));
        const minY = Math.min(...positionedWords.map((word) => word.bbox.y0));
        const maxY = Math.max(...positionedWords.map((word) => word.bbox.y1));
        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const columnWidth = width / 3;
        const rowHeight = height / 10;
        const columnCounts = [0, 0, 0];
        for (const word of positionedWords) {
            const centerX = (word.bbox.x0 + word.bbox.x1) / 2;
            const column = Math.max(0, Math.min(2, Math.floor((centerX - minX) / columnWidth)));
            columnCounts[column] += 1;
        }
        const looksLikeGrid = columnCounts.filter((count) => count > 10).length >= 3;
        if (!looksLikeGrid) {
            return this.extractRecordsFromText(normalizedText, startSeries, pageNumber);
        }
        const cells = Array.from({ length: 30 }, () => []);
        for (const word of positionedWords) {
            const centerX = (word.bbox.x0 + word.bbox.x1) / 2;
            const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
            const column = Math.max(0, Math.min(2, Math.floor((centerX - minX) / columnWidth)));
            const row = Math.max(0, Math.min(9, Math.floor((centerY - minY) / rowHeight)));
            cells[row * 3 + column].push(word);
        }
        const records = [];
        let series = startSeries;
        for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
            await this.ensureNotCancelled(jobId);
            const cellWords = cells[cellIndex];
            const row = Math.floor(cellIndex / 3);
            const column = cellIndex % 3;
            let record = this.createEmptyRecord(series, pageNumber, cellIndex + 1);
            if (cellWords.length) {
                const cellText = this.reconstructCellText(cellWords, rowHeight);
                record = this.extractSingleRecord(cellText, series, pageNumber, cellIndex + 1);
            }
            if (!this.hasRelation(record) && !record.deleted) {
                const retriedRecord = await this.retryWeakCellRecord(worker, image, cellWords, series, pageNumber, cellIndex + 1, imageDimensions, jobId, this.getGridCellRectangle(minX, minY, columnWidth, rowHeight, column, row, imageDimensions));
                record = this.pickBetterRecord(record, retriedRecord);
            }
            if (this.hasUsefulRecord(record)) {
                records.push(record);
                series += 1;
            }
        }
        return records.length
            ? records
            : this.extractRecordsFromText(normalizedText, startSeries, pageNumber);
    }
    reconstructCellText(words, rowHeight) {
        const sortedWords = [...words].sort((a, b) => {
            const ay = a.bbox.y0;
            const by = b.bbox.y0;
            if (Math.abs(ay - by) > 10) {
                return ay - by;
            }
            return a.bbox.x0 - b.bbox.x0;
        });
        const lines = [];
        const lineTolerance = Math.max(10, rowHeight * 0.08);
        for (const word of sortedWords) {
            const currentLine = lines[lines.length - 1];
            if (!currentLine) {
                lines.push([word]);
                continue;
            }
            const lastY = currentLine[0].bbox.y0;
            if (Math.abs(word.bbox.y0 - lastY) <= lineTolerance) {
                currentLine.push(word);
            }
            else {
                lines.push([word]);
            }
        }
        return lines
            .map((line) => line
            .sort((a, b) => a.bbox.x0 - b.bbox.x0)
            .map((word) => word.text?.trim() || "")
            .filter(Boolean)
            .join(" "))
            .join("\n");
    }
    clampRectangle(rectangle, imageDimensions) {
        const left = Math.max(0, Math.min(imageDimensions.width - 1, Math.round(rectangle.left)));
        const top = Math.max(0, Math.min(imageDimensions.height - 1, Math.round(rectangle.top)));
        const right = Math.max(left + 1, Math.min(imageDimensions.width, Math.round(rectangle.left + rectangle.width)));
        const bottom = Math.max(top + 1, Math.min(imageDimensions.height, Math.round(rectangle.top + rectangle.height)));
        return {
            left,
            top,
            width: Math.max(1, right - left),
            height: Math.max(1, bottom - top),
        };
    }
    getGridCellRectangle(minX, minY, columnWidth, rowHeight, column, row, imageDimensions, scale = 1) {
        const baseLeft = minX + columnWidth * column;
        const baseTop = minY + rowHeight * row;
        const paddingX = Math.max(12, Math.round(columnWidth * 0.08 * scale));
        const paddingY = Math.max(12, Math.round(rowHeight * 0.12 * scale));
        return this.clampRectangle({
            left: baseLeft - paddingX,
            top: baseTop - paddingY,
            width: columnWidth + paddingX * 2,
            height: rowHeight + paddingY * 2,
        }, imageDimensions);
    }
    getCellRectangle(words, imageDimensions, scale = 1) {
        const minX = Math.min(...words.map((word) => word.bbox.x0));
        const minY = Math.min(...words.map((word) => word.bbox.y0));
        const maxX = Math.max(...words.map((word) => word.bbox.x1));
        const maxY = Math.max(...words.map((word) => word.bbox.y1));
        const paddingX = Math.max(12, Math.round((maxX - minX) * 0.12 * scale));
        const paddingY = Math.max(12, Math.round((maxY - minY) * 0.18 * scale));
        return this.clampRectangle({
            left: minX - paddingX,
            top: minY - paddingY,
            width: (maxX - minX) + paddingX * 2,
            height: (maxY - minY) + paddingY * 2,
        }, imageDimensions);
    }
    async recognizeCellWithRectangle(worker, image, rectangle, psm) {
        await worker.setParameters({
            tessedit_pageseg_mode: psm,
        });
        const { data } = await worker.recognize(image, { rectangle }, { text: true });
        await worker.setParameters({
            tessedit_pageseg_mode: tesseract_js_1.PSM.AUTO,
        });
        return data.text || "";
    }
    async retryWeakCellRecord(worker, image, words, series, pageNumber, recordNumber, imageDimensions, jobId, gridRectangle) {
        try {
            const attempts = [
                ...(words.length
                    ? [
                        { rectangle: this.getCellRectangle(words, imageDimensions, 1), psm: tesseract_js_1.PSM.SINGLE_BLOCK },
                        { rectangle: this.getCellRectangle(words, imageDimensions, 1.45), psm: tesseract_js_1.PSM.SINGLE_BLOCK },
                        { rectangle: this.getCellRectangle(words, imageDimensions, 1.75), psm: tesseract_js_1.PSM.SPARSE_TEXT },
                    ]
                    : []),
                ...(gridRectangle
                    ? [
                        { rectangle: gridRectangle, psm: tesseract_js_1.PSM.SINGLE_BLOCK },
                        {
                            rectangle: this.clampRectangle({
                                left: gridRectangle.left - 10,
                                top: gridRectangle.top - 10,
                                width: gridRectangle.width + 20,
                                height: gridRectangle.height + 20,
                            }, imageDimensions),
                            psm: tesseract_js_1.PSM.SPARSE_TEXT,
                        },
                        {
                            rectangle: this.clampRectangle({
                                left: gridRectangle.left - 16,
                                top: gridRectangle.top - 16,
                                width: gridRectangle.width + 32,
                                height: gridRectangle.height + 32,
                            }, imageDimensions),
                            psm: tesseract_js_1.PSM.SINGLE_BLOCK,
                        },
                        {
                            rectangle: this.clampRectangle({
                                left: gridRectangle.left - 24,
                                top: gridRectangle.top - 18,
                                width: gridRectangle.width + 48,
                                height: gridRectangle.height + 36,
                            }, imageDimensions),
                            psm: tesseract_js_1.PSM.SPARSE_TEXT,
                        },
                    ]
                    : []),
            ];
            let bestRecord = this.createEmptyRecord(series, pageNumber, recordNumber);
            for (const attempt of attempts) {
                await this.ensureNotCancelled(jobId);
                const text = await this.recognizeCellWithRectangle(worker, image, attempt.rectangle, attempt.psm);
                const record = this.extractSingleRecord(text, series, pageNumber, recordNumber);
                bestRecord = this.pickBetterRecord(bestRecord, record);
                if (bestRecord.deleted || (bestRecord.name && this.hasRelation(bestRecord))) {
                    return bestRecord;
                }
            }
            return bestRecord;
        }
        catch {
            return this.createEmptyRecord(series, pageNumber, recordNumber);
        }
    }
    getRecordScore(record) {
        return [
            record.name && record.name !== "Deleted" ? record.name : null,
            record.fatherName,
            record.husbandName,
            record.motherName,
            record.otherName,
            record.deleted ? "deleted" : null,
        ].filter(Boolean).length;
    }
    pickBetterRecord(primary, fallback) {
        const primaryScore = this.getRecordScore(primary);
        const fallbackScore = this.getRecordScore(fallback);
        if (fallbackScore > primaryScore) {
            return fallback;
        }
        if (fallbackScore === primaryScore) {
            const primaryNameLength = primary.name?.length || 0;
            const fallbackNameLength = fallback.name?.length || 0;
            if (fallbackNameLength > primaryNameLength) {
                return fallback;
            }
        }
        return primary;
    }
    looksLikeTablePage(normalizedText) {
        const upper = String(normalizedText || '').toUpperCase();
        return (upper.includes('SERIAL') &&
            upper.includes('HOUSE') &&
            upper.includes('RELATIVE NAME') &&
            upper.includes('EPIC'));
    }
    extractNameFromTableLeft(left) {
        const tokens = String(left || '').split(/\s+/).filter(Boolean);
        const houseWords = /^(HOUSE|HOUSENO|HNO|H.NO|NO|GALI|BLOCK|WARD|FLOOR|HNO-?|HOUSE-?)$/i;
        const startIndex = tokens.findIndex((token) => {
            const cleaned = token.replace(/[^A-Z0-9./-]/gi, '');
            if (!cleaned)
                return false;
            if (houseWords.test(cleaned))
                return false;
            if (/\d/.test(cleaned))
                return false;
            return /[A-Z]/i.test(cleaned);
        });
        if (startIndex === -1) {
            return null;
        }
        return this.cleanValue(tokens.slice(startIndex).join(' '));
    }
    extractRecordsFromTableText(normalizedText, startSeries, pageNumber) {
        if (!this.looksLikeTablePage(normalizedText)) {
            return [];
        }
        const lines = normalizedText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => !this.isTableNoiseLine(line));
        const rowTexts = [];
        let current = '';
        for (const line of lines) {
            if (/^\d+\s+/.test(line)) {
                if (current)
                    rowTexts.push(current.trim());
                current = line;
            }
            else if (current) {
                current += ' ' + line;
            }
        }
        if (current) {
            rowTexts.push(current.trim());
        }
        const records = [];
        let nextSeries = startSeries;
        for (const rowText of rowTexts) {
            const rowMatch = rowText.match(/^(\d+)\s+(.+)$/i);
            if (!rowMatch) {
                continue;
            }
            const recordNumber = Number(rowMatch[1]);
            let body = rowMatch[2].trim();
            body = body
                .replace(/\s+[MFT]\s+\d{1,3}\s+[A-Z0-9 ]{5,}$/i, '')
                .replace(/\s+\d{1,3}\s+[A-Z0-9 ]{5,}$/i, '')
                .replace(/\s+[A-Z]{2,}\s*\d{5,}$/i, '')
                .trim();
            const relationMatch = body.match(/^(.*?)\s+([FHMOWG0}])\s+(.+)$/i);
            const leftSide = relationMatch ? relationMatch[1] : body;
            const name = this.extractNameFromTableLeft(leftSide);
            const record = this.createEmptyRecord(nextSeries, pageNumber, recordNumber);
            record.name = name;
            if (this.hasUsefulRecord(record)) {
                records.push(record);
                nextSeries += 1;
            }
        }
        return records;
    }
    isTableNoiseLine(line) {
        const upper = String(line || '').toUpperCase();
        return (!upper ||
            upper.includes('ASSEMBLY CONSTITUENCY') ||
            upper.includes('PART NO') ||
            upper.includes('SERIAL HOUSE NUMBER') ||
            upper.includes('RELATION') ||
            upper.includes('SEX ') ||
            upper.includes('EPIC - ELECTOR PHOTO') ||
            /^\d+\s*\/\s*\d+$/.test(upper));
    }
    getTableColumnStarts(words) {
        const headerWords = words
            .filter((word) => word.text && word.bbox && word.bbox.y0 < 200)
            .map((word) => ({
            text: String(word.text || '').toUpperCase(),
            x0: word.bbox.x0,
            y1: word.bbox.y1,
        }));
        const findX = (matcher) => headerWords.find((word) => matcher.test(word.text))?.x0 ?? null;
        const serialStart = findX(/^SERIAL$/);
        const houseStart = findX(/^HOUSE$/);
        const nameStart = findX(/^NAME$/);
        const relStart = findX(/^REL$/);
        const relativeStart = findX(/^RELATIVE$/);
        const genderStart = findX(/^GEND/);
        const ageStart = findX(/^AGE$/);
        const epicStart = findX(/^EPIC$/);
        const headerBottom = Math.max(0, ...headerWords
            .filter((word) => /^(SERIAL|HOUSE|NUMBER|NAME|REL|RELATIVE|GEND|AGE|EPIC|TYPE)$/.test(word.text))
            .map((word) => word.y1));
        if ([serialStart, houseStart, nameStart, relStart, relativeStart, genderStart, ageStart, epicStart].some((value) => value == null)) {
            return null;
        }
        return {
            serialStart,
            houseStart,
            nameStart,
            relStart,
            relativeStart,
            genderStart,
            ageStart,
            epicStart,
            headerBottom,
        };
    }
    getTableColumnIndexByX(x, starts) {
        if (x < starts.houseStart)
            return 0;
        if (x < starts.nameStart)
            return 1;
        if (x < starts.relStart)
            return 2;
        if (x < starts.relativeStart)
            return 3;
        if (x < starts.genderStart)
            return 4;
        if (x < starts.ageStart)
            return 5;
        if (x < starts.epicStart)
            return 6;
        return 7;
    }
    normalizeRelationType(value) {
        const token = String(value || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
        if (!token)
            return null;
        if (token.startsWith('F'))
            return 'F';
        if (token.startsWith('H'))
            return 'H';
        if (token.startsWith('W'))
            return 'W';
        if (token.startsWith('M'))
            return 'M';
        if (token.startsWith('O') || token.startsWith('0'))
            return 'O';
        if (token.startsWith('G'))
            return 'G';
        return null;
    }
    looksLikeStandaloneTableRow(line) {
        const relationType = this.normalizeRelationType(line.rel);
        const hasName = Boolean(this.cleanValue(line.name));
        const hasRelative = Boolean(this.cleanValue(line.relative));
        const hasAge = /\d{1,3}/.test(String(line.age || ''));
        const hasEpic = /[A-Z]{2,}\d{4,}/i.test(String(line.epic || ''));
        const hasHouse = /[A-Z0-9]/i.test(String(line.house || ''));
        return hasName && hasRelative && Boolean(relationType) && (hasAge || hasEpic || hasHouse);
    }
    extractRecordsFromTablePage(words, normalizedText, startSeries, pageNumber) {
        if (!this.looksLikeTablePage(normalizedText) || !words.length) {
            return [];
        }
        const columnStarts = this.getTableColumnStarts(words);
        if (!columnStarts) {
            return [];
        }
        const sortedWords = [...words]
            .filter((word) => word.bbox && word.bbox.y0 > columnStarts.headerBottom + 8)
            .sort((a, b) => {
            const ay = a.bbox.y0;
            const by = b.bbox.y0;
            if (Math.abs(ay - by) > 10) {
                return ay - by;
            }
            return a.bbox.x0 - b.bbox.x0;
        });
        const lineTolerance = 12;
        const lineGroups = [];
        for (const word of sortedWords) {
            const current = lineGroups[lineGroups.length - 1];
            if (!current || Math.abs(word.bbox.y0 - current.y) > lineTolerance) {
                lineGroups.push({ y: word.bbox.y0, words: [word] });
            }
            else {
                current.words.push(word);
            }
        }
        const structuredLines = lineGroups
            .map((group) => {
            const columns = ['', '', '', '', '', '', '', ''];
            const ordered = [...group.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
            for (const word of ordered) {
                const idx = this.getTableColumnIndexByX(word.bbox.x0, columnStarts);
                columns[idx] = (columns[idx] + ' ' + (word.text || '')).trim();
            }
            return {
                text: ordered.map((word) => (word.text || '').trim()).filter(Boolean).join(' '),
                serial: columns[0],
                house: columns[1],
                name: columns[2],
                rel: columns[3],
                relative: columns[4],
                gender: columns[5],
                age: columns[6],
                epic: columns[7],
            };
        })
            .filter((line) => !this.isTableNoiseLine(line.text));
        const rows = [];
        let current = null;
        for (const line of structuredLines) {
            const serialMatch = String(line.serial || '').match(/^\d+/);
            const isNewRow = Boolean(serialMatch);
            if (isNewRow) {
                if (current)
                    rows.push(current);
                current = {
                    serial: Number(serialMatch[0]),
                    house: line.house ? [line.house] : [],
                    name: line.name ? [line.name] : [],
                    rel: line.rel ? [line.rel] : [],
                    relative: line.relative ? [line.relative] : [],
                    gender: line.gender ? [line.gender] : [],
                    age: line.age ? [line.age] : [],
                    epic: line.epic ? [line.epic] : [],
                };
                continue;
            }
            if (!current) {
                continue;
            }
            if (line.house)
                current.house.push(line.house);
            if (line.name)
                current.name.push(line.name);
            if (line.rel)
                current.rel.push(line.rel);
            if (line.relative)
                current.relative.push(line.relative);
            if (line.gender)
                current.gender.push(line.gender);
            if (line.age)
                current.age.push(line.age);
            if (line.epic)
                current.epic.push(line.epic);
        }
        if (current)
            rows.push(current);
        const records = [];
        let nextSeries = startSeries;
        for (const row of rows) {
            const name = this.cleanValue(row.name.join(' '));
            const record = this.createEmptyRecord(nextSeries, pageNumber, row.serial || null);
            record.name = name;
            if (this.hasUsefulRecord(record)) {
                records.push(record);
                nextSeries += 1;
            }
        }
        return records;
    }
    extractRecordsFromText(text, startSeries, pageNumber) {
        const lines = text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        const records = [];
        let current = null;
        let nextSeries = startSeries;
        for (const line of lines) {
            if (/\bdeleted\b/i.test(line)) {
                if (current && this.hasUsefulRecord(current)) {
                    records.push(current);
                }
                current = {
                    ...this.createEmptyRecord(nextSeries, pageNumber, nextSeries - startSeries + 1),
                    name: "Deleted",
                    deleted: true,
                };
                records.push(current);
                current = null;
                nextSeries += 1;
                continue;
            }
            const nameMatch = line.match(/^(?:['.,&]?\s*)?(?:(\d+|[&.])?[.)]?\s*)?Name\s*[:\-,.]?\s*(.+)$/i);
            if (nameMatch) {
                if (current && this.hasUsefulRecord(current)) {
                    records.push(current);
                }
                const explicitSeries = nameMatch[1] && /^\d+$/.test(nameMatch[1])
                    ? Number(nameMatch[1])
                    : null;
                current = {
                    ...this.createEmptyRecord(explicitSeries || nextSeries, pageNumber, (explicitSeries || nextSeries) - startSeries + 1),
                    name: this.cleanValue(nameMatch[2]),
                };
                nextSeries = (explicitSeries || nextSeries) + 1;
                continue;
            }
            if (!current) {
                continue;
            }
            const fatherMatch = line.match(/^(?:['.,&]?\s*)?(?:Father\s*Name|Father'?s\s*Name|S\/O|Son\s+Of)\s*[:\-,.]?\s*(.+)$/i);
            if (fatherMatch) {
                current.fatherName = this.cleanValue(fatherMatch[1]);
                continue;
            }
            const husbandMatch = line.match(/^(?:['.,&]?\s*)?(?:Husband\s*Name|Husband'?s\s*Name|W\/O|Wife\s+Of)\s*[:\-,.]?\s*(.+)$/i);
            if (husbandMatch) {
                current.husbandName = this.cleanValue(husbandMatch[1]);
                continue;
            }
            const motherMatch = line.match(/^(?:['.,&]?\s*)?(?:Mother\s*Name|Mother'?s\s*Name)\s*[:\-,.]?\s*(.+)$/i);
            if (motherMatch) {
                current.motherName = this.cleanValue(motherMatch[1]);
                continue;
            }
            const otherMatch = line.match(/^(?:['.,&]?\s*)?(?:Others?|Other'?s\s*Name)\s*[:\-,.]?\s*(.+)$/i);
            if (otherMatch) {
                current.otherName = this.cleanValue(otherMatch[1]);
            }
        }
        if (current && this.hasUsefulRecord(current)) {
            records.push(current);
        }
        return records;
    }
    extractSingleRecord(text, series, pageNumber, recordNumber) {
        if (this.isDeletedContent(text)) {
            return {
                ...this.createEmptyRecord(series, pageNumber, recordNumber),
                name: "Deleted",
                deleted: true,
            };
        }
        const lines = this.normalizeExtractedText(text)
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.some((line) => /\bdeleted\b/i.test(line))) {
            return {
                ...this.createEmptyRecord(series, pageNumber, recordNumber),
                name: "Deleted",
                deleted: true,
            };
        }
        const nameCandidates = [];
        let fatherName = null;
        let husbandName = null;
        let motherName = null;
        let otherName = null;
        for (const line of lines) {
            const nameMatch = line.match(/^(?:['.,&]?\s*)?(?:(\d+|[&.])?[.)]?\s*)?Name\s*[:\-,.]?\s*(.+)$/i);
            if (nameMatch) {
                const candidate = this.cleanValue(nameMatch[2]);
                if (candidate) {
                    nameCandidates.push(candidate);
                }
                continue;
            }
            const fatherMatch = line.match(/^(?:['.,&]?\s*)?(?:Father\s*Name|Father'?s\s*Name|S\/O|Son\s+Of)\s*[:\-,.]?\s*(.+)$/i);
            if (fatherMatch) {
                fatherName = this.cleanValue(fatherMatch[1]);
                continue;
            }
            const husbandMatch = line.match(/^(?:['.,&]?\s*)?(?:Husband\s*Name|Husband'?s\s*Name|W\/O|Wife\s+Of)\s*[:\-,.]?\s*(.+)$/i);
            if (husbandMatch) {
                husbandName = this.cleanValue(husbandMatch[1]);
                continue;
            }
            const motherMatch = line.match(/^(?:['.,&]?\s*)?(?:Mother\s*Name|Mother'?s\s*Name)\s*[:\-,.]?\s*(.+)$/i);
            if (motherMatch) {
                motherName = this.cleanValue(motherMatch[1]);
                continue;
            }
            const otherMatch = line.match(/^(?:['.,&]?\s*)?(?:Others?|Other'?s\s*Name)\s*[:\-,.]?\s*(.+)$/i);
            if (otherMatch) {
                otherName = this.cleanValue(otherMatch[1]);
            }
        }
        const uniqueNameCandidates = [...new Set(nameCandidates)];
        const name = husbandName && uniqueNameCandidates.length > 1
            ? uniqueNameCandidates[uniqueNameCandidates.length - 1]
            : uniqueNameCandidates[0] || null;
        if (this.looksLikeDeletedByQuality(text, name, Boolean(fatherName || husbandName || motherName || otherName))) {
            return {
                ...this.createEmptyRecord(series, pageNumber, recordNumber),
                name: "Deleted",
                deleted: true,
            };
        }
        return {
            series,
            pageNumber,
            recordNumber,
            name,
            fatherName,
            husbandName,
            motherName,
            otherName,
            deleted: false,
        };
    }
    looksLikeDeletedByQuality(rawText, name, hasRelation) {
        const upper = String(rawText || "").toUpperCase();
        const hasStampArtifacts = /\bQ\b/.test(upper) || /\bLE\b/.test(upper) || /\bLL\b/.test(upper);
        const hasBrokenHouseLine = /HAUSA\s+NU|HOUSE\s+NU\b|HAUSE\s+NU\b|HOUSE\s+N\b/i.test(upper);
        const looksClipped = Boolean(name) && name.split(" ").some((part) => part.length <= 2);
        return !hasRelation && hasStampArtifacts && (hasBrokenHouseLine || looksClipped);
    }
    isDeletedContent(rawText) {
        const upper = String(rawText || "").toUpperCase();
        const merged = upper.replace(/[^A-Z]/g, "");
        return (/\bDEL[EI1]T[EI1]D\b/i.test(upper) ||
            /\bDELE[T7][EI1]D\b/i.test(upper) ||
            /\bD[E3]L[E3][T7][E3]D\b/i.test(upper) ||
            merged.includes("DELETED") ||
            merged.includes("DELETED") ||
            merged.includes("DELLETED") ||
            merged.includes("DELETFD") ||
            merged.includes("DELETCD"));
    }
    shouldTrustParsedPdfRecords(records) {
        const recordsWithRelation = records.filter((record) => record.deleted || this.hasRelation(record)).length;
        return records.length >= 5 || recordsWithRelation >= 1;
    }
    async detectPdfProfile(filePath, worker, jobId) {
        const samplePages = await (0, pdf_img_convert_1.convert)(filePath, {
            scale: 1.4,
            page_numbers: [1, 2, 3],
        });
        for (let index = 0; index < samplePages.length; index += 1) {
            await this.ensureNotCancelled(jobId);
            const { data } = await worker.recognize(Buffer.from(samplePages[index]));
            const normalizedText = this.normalizeExtractedText(data.text || "");
            if (this.looksLikeTablePage(normalizedText)) {
                return "table";
            }
        }
        return "grid";
    }
    normalizeExtractedText(rawText) {
        const normalizedLines = rawText
            .replace(/\r/g, "\n")
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'")
            .replace(/[—–]/g, "-")
            .replace(/\bMame\b/gi, "Name")
            .replace(/\bMama\b/gi, "Name")
            .replace(/\bNarne\b/gi, "Name")
            .replace(/\bNarre\b/gi, "Name")
            .replace(/\bNama\b/gi, "Name")
            .replace(/\bMarne\b/gi, "Name")
            .replace(/\bMarna\b/gi, "Name")
            .replace(/\bMarre\b/gi, "Name")
            .replace(/\bMare\b/gi, "Name")
            .replace(/\bMNarme\b/gi, "Name")
            .replace(/\bNane\b/gi, "Name")
            .replace(/\bNome\b/gi, "Name")
            .replace(/\bWame\b/gi, "Name")
            .replace(/\bNa\s*me\b/gi, "Name")
            .replace(/\bFatlher\b/gi, "Father")
            .replace(/\bFathar\b/gi, "Father")
            .replace(/\b'?ather'?s?\b/gi, "Father")
            .replace(/\bFathers?\b/gi, "Father")
            .replace(/\bHusbands?\b/gi, "Husband")
            .replace(/\bHustands?\b/gi, "Husband")
            .replace(/\bHustand\b/gi, "Husband")
            .replace(/\bMothers?\b/gi, "Mother")
            .replace(/\bSons?\s+Of\b/gi, "Son Of")
            .replace(/\bWife\s+Of\b/gi, "Wife Of")
            .split("\n")
            .map((line) => line
            .replace(/[|_=~`]+/g, " ")
            .replace(/[^a-z0-9\s:/&.,'()\-]/gi, " ")
            .replace(/\s+/g, " ")
            .trim())
            .filter((line) => this.shouldKeepLine(line));
        return normalizedLines
            .join("\n")
            .replace(/\bFather\s+Name\b/gi, "Father Name")
            .replace(/\bHusband\s+Name\b/gi, "Husband Name")
            .replace(/\bMother\s+Name\b/gi, "Mother Name")
            .replace(/\bOther\s+Name\b/gi, "Other Name")
            .replace(/\bSon\s+Of\b/gi, "Son Of")
            .replace(/\bWife\s+Of\b/gi, "Wife Of")
            .replace(/\n+/g, "\n")
            .trim();
    }
    shouldKeepLine(line) {
        if (!line) {
            return false;
        }
        if (/(^(?:\d+[.)]?\s*)?name\b|father|husband|mother|others?|s\/o|w\/o|son\s+of|wife\s+of|deleted)/i.test(line)) {
            return true;
        }
        const letters = (line.match(/[a-z]/gi) || []).length;
        const digits = (line.match(/\d/g) || []).length;
        return letters >= 3 && letters >= digits;
    }
    correctNameSpelling(value) {
        if (!value) {
            return value;
        }
        const tokenCorrections = {
            SIGH: "SINGH",
            SNGH: "SINGH",
            SING: "SINGH",
            KUWAR: "KUMAR",
            KUMAF: "KUMAR",
            KUMA: "KUMAR",
            KUMER: "KUMAR",
            DEVII: "DEVI",
            DEYI: "DEVI",
            SHARWA: "SHARMA",
            KHATOOM: "KHATOON"
        };
        const corrected = value
            .split(" ")
            .map((token) => tokenCorrections[token] || token)
            .join(" ")
            .replace(/\bSINGHH\b/g, "SINGH")
            .replace(/\bKUMARR\b/g, "KUMAR")
            .replace(/\bDEVII\b/g, "DEVI")
            .trim();
        return corrected || null;
    }
    looksLikeLooseNameLine(line) {
        const cleaned = this.cleanValue(line);
        if (!cleaned) {
            return null;
        }
        if (/\b(?:father|husband|mother|other|others|son of|wife of|s\/o|w\/o|age|gender|house|photo|available|epic|serial)\b/i.test(line)) {
            return null;
        }
        return cleaned;
    }
    cleanValue(value) {
        const cleaned = value
            .replace(/\bdeleted\b.*$/i, "")
            .replace(/\b(?:father|husband|mother|other|others)\s*'?s?\b.*$/i, "")
            .replace(/^(?:name|father\s*name|father'?s\s*name|husband\s*name|husband'?s\s*name|mother\s*name|mother'?s\s*name|others?|other'?s\s*name)\s*[:\-,.]?\s*/i, "")
            .replace(/\b(?:age|gender|male|female|house|number|photo|available|epic|id|card|years?)\b.*$/i, "")
            .replace(/[^a-z\s.']/gi, " ")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/\b\w/g, (char) => char.toUpperCase());
        if (!cleaned || cleaned.length < 3) {
            return null;
        }
        return this.correctNameSpelling(cleaned);
    }
    hasRelation(record) {
        return Boolean(record.fatherName || record.husbandName || record.motherName || record.otherName);
    }
    hasUsefulRecord(record) {
        return record.deleted || Boolean(record.name);
    }
    createEmptyRecord(series, pageNumber, recordNumber) {
        return {
            series,
            pageNumber,
            recordNumber,
            name: null,
            fatherName: null,
            husbandName: null,
            motherName: null,
            otherName: null,
            deleted: false,
        };
    }
    toResponse(result) {
        return {
            id: result._id.toString(),
            originalFileName: result.originalFileName,
            status: result.status ?? "queued",
            errorMessage: result.errorMessage ?? null,
            records: result.records ?? [],
            confidenceScore: result.confidenceScore ?? 0,
            warnings: result.warnings ?? [],
            rawExtractedText: result.rawExtractedText ?? "",
            processedPages: result.processedPages ?? 0,
            totalPages: result.totalPages ?? 0,
            createdAt: result.createdAt,
            updatedAt: result.updatedAt,
        };
    }
};
exports.ExtractionService = ExtractionService;
exports.ExtractionService = ExtractionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(extraction_result_schema_1.ExtractionResult.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], ExtractionService);
//# sourceMappingURL=extraction.service.js.map