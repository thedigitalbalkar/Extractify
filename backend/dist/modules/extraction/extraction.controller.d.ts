import { ExtractionService } from "./extraction.service";
export declare class ExtractionController {
    private readonly extractionService;
    constructor(extractionService: ExtractionService);
    upload(file: Express.Multer.File): Promise<{
        id: any;
        originalFileName: any;
        status: any;
        errorMessage: any;
        records: any;
        confidenceScore: any;
        warnings: any;
        rawExtractedText: any;
        processedPages: any;
        totalPages: any;
        createdAt: any;
        updatedAt: any;
    }>;
    getResult(id: string): Promise<{
        id: any;
        originalFileName: any;
        status: any;
        errorMessage: any;
        records: any;
        confidenceScore: any;
        warnings: any;
        rawExtractedText: any;
        processedPages: any;
        totalPages: any;
        createdAt: any;
        updatedAt: any;
    }>;
    cancelResult(id: string): Promise<{
        id: any;
        originalFileName: any;
        status: any;
        errorMessage: any;
        records: any;
        confidenceScore: any;
        warnings: any;
        rawExtractedText: any;
        processedPages: any;
        totalPages: any;
        createdAt: any;
        updatedAt: any;
    }>;
}
