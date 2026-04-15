import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ExtractionModule } from "./modules/extraction/extraction.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri:
          configService.get<string>("MONGODB_URI") ||
          "mongodb://localhost:27017/extractify",
      }),
    }),
    ExtractionModule,
  ],
})
export class AppModule {}
