import { HydratedDocument } from "mongoose";
export type ExtractionResultDocument = HydratedDocument<ExtractionResult>;
export declare class ExtractedPersonRecord {
    series: number;
    pageNumber: number | null;
    recordNumber: number | null;
    name: string | null;
    fatherName: string | null;
    husbandName: string | null;
    motherName: string | null;
    otherName: string | null;
    deleted: boolean;
}
export declare const ExtractedPersonRecordSchema: import("mongoose").Schema<ExtractedPersonRecord, import("mongoose").Model<ExtractedPersonRecord, any, any, any, import("mongoose").Document<unknown, any, ExtractedPersonRecord, any, {}> & ExtractedPersonRecord & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ExtractedPersonRecord, import("mongoose").Document<unknown, {}, import("mongoose").FlatRecord<ExtractedPersonRecord>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<ExtractedPersonRecord> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
export declare class ExtractionResult {
    originalFileName: string;
    storedFileName: string;
    mimeType: string;
    filePath: string;
    status: "queued" | "processing" | "completed" | "failed" | "cancelled";
    errorMessage: string | null;
    rawExtractedText: string;
    records: ExtractedPersonRecord[];
    confidenceScore: number;
    warnings: string[];
    processedPages: number;
    totalPages: number;
}
export declare const ExtractionResultSchema: import("mongoose").Schema<ExtractionResult, import("mongoose").Model<ExtractionResult, any, any, any, import("mongoose").Document<unknown, any, ExtractionResult, any, {}> & ExtractionResult & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ExtractionResult, import("mongoose").Document<unknown, {}, import("mongoose").FlatRecord<ExtractionResult>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<ExtractionResult> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
