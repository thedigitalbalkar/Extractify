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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtractionResultSchema = exports.ExtractionResult = exports.ExtractedPersonRecordSchema = exports.ExtractedPersonRecord = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let ExtractedPersonRecord = class ExtractedPersonRecord {
};
exports.ExtractedPersonRecord = ExtractedPersonRecord;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], ExtractedPersonRecord.prototype, "series", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Number)
], ExtractedPersonRecord.prototype, "pageNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Number)
], ExtractedPersonRecord.prototype, "recordNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], ExtractedPersonRecord.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], ExtractedPersonRecord.prototype, "fatherName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], ExtractedPersonRecord.prototype, "husbandName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], ExtractedPersonRecord.prototype, "motherName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], ExtractedPersonRecord.prototype, "otherName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ExtractedPersonRecord.prototype, "deleted", void 0);
exports.ExtractedPersonRecord = ExtractedPersonRecord = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], ExtractedPersonRecord);
exports.ExtractedPersonRecordSchema = mongoose_1.SchemaFactory.createForClass(ExtractedPersonRecord);
let ExtractionResult = class ExtractionResult {
};
exports.ExtractionResult = ExtractionResult;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], ExtractionResult.prototype, "originalFileName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], ExtractionResult.prototype, "storedFileName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], ExtractionResult.prototype, "mimeType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], ExtractionResult.prototype, "filePath", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: ["queued", "processing", "completed", "failed", "cancelled"], default: "queued" }),
    __metadata("design:type", String)
], ExtractionResult.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], ExtractionResult.prototype, "errorMessage", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: "" }),
    __metadata("design:type", String)
], ExtractionResult.prototype, "rawExtractedText", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [exports.ExtractedPersonRecordSchema], default: [] }),
    __metadata("design:type", Array)
], ExtractionResult.prototype, "records", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ExtractionResult.prototype, "confidenceScore", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], ExtractionResult.prototype, "warnings", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ExtractionResult.prototype, "processedPages", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], ExtractionResult.prototype, "totalPages", void 0);
exports.ExtractionResult = ExtractionResult = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], ExtractionResult);
exports.ExtractionResultSchema = mongoose_1.SchemaFactory.createForClass(ExtractionResult);
//# sourceMappingURL=extraction-result.schema.js.map