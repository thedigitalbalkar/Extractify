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
exports.ExtractionController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const multer_1 = require("multer");
const fs_1 = require("fs");
const path_1 = require("path");
const uuid_1 = require("uuid");
const extraction_service_1 = require("./extraction.service");
let ExtractionController = class ExtractionController {
    constructor(extractionService) {
        this.extractionService = extractionService;
    }
    upload(file) {
        return this.extractionService.processUpload(file);
    }
    getResult(id) {
        return this.extractionService.getResult(id);
    }
    cancelResult(id) {
        return this.extractionService.cancelResult(id);
    }
};
exports.ExtractionController = ExtractionController;
__decorate([
    (0, common_1.Post)("upload"),
    (0, swagger_1.ApiConsumes)("multipart/form-data"),
    (0, swagger_1.ApiBody)({
        schema: {
            type: "object",
            properties: {
                file: { type: "string", format: "binary" },
            },
            required: ["file"],
        },
    }),
    (0, swagger_1.ApiOkResponse)({ description: "Upload accepted and queued for processing" }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)("file", {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, callback) => {
                const uploadDir = process.env.UPLOAD_DIR ||
                    (0, path_1.join)(process.cwd(), "uploads");
                if (!(0, fs_1.existsSync)(uploadDir)) {
                    (0, fs_1.mkdirSync)(uploadDir, { recursive: true });
                }
                callback(null, uploadDir);
            },
            filename: (_req, file, callback) => {
                callback(null, `${(0, uuid_1.v4)()}${(0, path_1.extname)(file.originalname)}`);
            },
        }),
        limits: {
            fileSize: (Number(process.env.MAX_FILE_SIZE_MB || 15) || 15) * 1024 * 1024,
        },
        fileFilter: (_req, file, callback) => {
            const allowedMimeTypes = [
                "application/pdf",
                "image/jpeg",
                "image/png",
            ];
            callback(null, allowedMimeTypes.includes(file.mimetype));
        },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ExtractionController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)("/api/results/:id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ExtractionController.prototype, "getResult", null);
__decorate([
    (0, common_1.Post)("/api/results/:id/cancel"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ExtractionController.prototype, "cancelResult", null);
exports.ExtractionController = ExtractionController = __decorate([
    (0, swagger_1.ApiTags)("Extraction"),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [extraction_service_1.ExtractionService])
], ExtractionController);
//# sourceMappingURL=extraction.controller.js.map