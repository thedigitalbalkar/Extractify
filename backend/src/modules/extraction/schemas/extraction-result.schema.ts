import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type ExtractionResultDocument = HydratedDocument<ExtractionResult>;

@Schema({ _id: false })
export class ExtractedPersonRecord {
  @Prop({ required: true })
  series: number;

  @Prop({ default: null })
  pageNumber: number | null;

  @Prop({ default: null })
  recordNumber: number | null;

  @Prop({ default: null })
  name: string | null;

  @Prop({ default: null })
  fatherName: string | null;

  @Prop({ default: null })
  husbandName: string | null;

  @Prop({ default: null })
  motherName: string | null;

  @Prop({ default: null })
  otherName: string | null;

  @Prop({ default: false })
  deleted: boolean;
}

export const ExtractedPersonRecordSchema =
  SchemaFactory.createForClass(ExtractedPersonRecord);

@Schema({ timestamps: true })
export class ExtractionResult {
  @Prop({ required: true })
  originalFileName: string;

  @Prop({ required: true })
  storedFileName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  filePath: string;

  @Prop({ enum: ["queued", "processing", "completed", "failed", "cancelled"], default: "queued" })
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";

  @Prop({ default: null })
  errorMessage: string | null;

  @Prop({ default: "" })
  rawExtractedText: string;

  @Prop({ type: [ExtractedPersonRecordSchema], default: [] })
  records: ExtractedPersonRecord[];

  @Prop({ default: 0 })
  confidenceScore: number;

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ default: 0 })
  processedPages: number;

  @Prop({ default: 0 })
  totalPages: number;
}

export const ExtractionResultSchema =
  SchemaFactory.createForClass(ExtractionResult);
