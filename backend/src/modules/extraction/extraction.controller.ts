import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { diskStorage } from "multer";
import { existsSync, mkdirSync } from "fs";
import { extname, join } from "path";
import { v4 as uuid } from "uuid";
import { ExtractionService } from "./extraction.service";

@ApiTags("Extraction")
@Controller()
export class ExtractionController {
  constructor(private readonly extractionService: ExtractionService) {}

  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
      },
      required: ["file"],
    },
  })
  @ApiOkResponse({ description: "Upload accepted and queued for processing" })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          const uploadDir =
            process.env.UPLOAD_DIR ||
            join(process.cwd(), "uploads");

          if (!existsSync(uploadDir)) {
            mkdirSync(uploadDir, { recursive: true });
          }

          callback(null, uploadDir);
        },
        filename: (_req, file, callback) => {
          callback(null, `${uuid()}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize:
          (Number(process.env.MAX_FILE_SIZE_MB || 15) || 15) * 1024 * 1024,
      },
      fileFilter: (_req, file, callback) => {
        const allowedMimeTypes = [
          "application/pdf",
          "image/jpeg",
          "image/png",
        ];

        callback(null, allowedMimeTypes.includes(file.mimetype));
      },
    })
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.extractionService.processUpload(file);
  }

  @Get("results/:id")
  getResult(@Param("id") id: string) {
    return this.extractionService.getResult(id);
  }

  @Post("results/:id/cancel")
  cancelResult(@Param("id") id: string) {
    return this.extractionService.cancelResult(id);
  }
}

