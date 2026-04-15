import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import {
  ExtractionResult,
  ExtractionResultSchema,
} from "./schemas/extraction-result.schema";
import { ExtractionController } from "./extraction.controller";
import { ExtractionService } from "./extraction.service";

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ExtractionResult.name, schema: ExtractionResultSchema },
    ]),
  ],
  controllers: [ExtractionController],
  providers: [ExtractionService],
})
export class ExtractionModule {}
