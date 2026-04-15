# Extractify

Extractify is a full-stack application that extracts ordered person records from PDF and image files.

It currently focuses on:
- Name
- Father's Name
- Husband's Name

## Tech Stack

- Frontend: React + Vite
- Backend: NestJS
- Database: MongoDB
- OCR: Tesseract.js

## Requirements

Make sure these are installed on your machine:
- Node.js 18+ recommended
- npm
- MongoDB running locally

## Project Structure

```text
Extractify/
  backend/
  frontend/
```

## Localhost Setup

### 1. Start MongoDB

Make sure MongoDB is running locally on:

```text
mongodb://localhost:27017/extractify
```

If you use a different MongoDB URL, update the backend `.env` file.

### 2. Backend Setup

Open a terminal in `F:\Extractify\backend` and run:

```powershell
cd F:\Extractify\backend
copy ➡ .env.example .env
npm install
npm run start:dev
```

Backend will run on:

```text
http://localhost:4000
```

Swagger docs:

```text
http://localhost:4000/api/docs
```

### 3. Frontend Setup

Open another terminal in `F:\Extractify\frontend` and run:

```powershell
cd F:\Extractify\frontend
copy .env.example .env
npm install
npm run dev
```

Frontend will run on the Vite local URL shown in the terminal.
Usually:

```text
http://localhost:5173
```

## Environment Files

### Backend `.env`

Default example:

```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/extractify
MAX_FILE_SIZE_MB=10
UPLOAD_DIR=uploads
```

Notes:
- `PORT`: backend port
- `MONGODB_URI`: local MongoDB connection string
- `MAX_FILE_SIZE_MB`: upload limit in MB
- `UPLOAD_DIR`: local folder where uploaded files are stored

### Frontend `.env`

Default example:

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

## How To Run The App

1. Start MongoDB.
2. Start the backend.
3. Start the frontend.
4. Open the frontend URL in your browser.
5. Upload a PDF, JPG, or PNG file.
6. Wait for extraction to complete.
7. Review the extracted records.
8. Use `Download CSV` if you want to export the extracted data.

## What The App Does

- Uploads PDF/JPG/PNG files
- Extracts records in ordered series
- Returns only the required fields
- Processes long files using async background extraction
- Lets you export extracted records as CSV

## Useful Commands

### Backend

```powershell
cd F:\Extractify\backend
npm run start:dev
```

```powershell
cd F:\Extractify\backend
npm run build
```

### Frontend

```powershell
cd F:\Extractify\frontend
npm run dev
```

```powershell
cd F:\Extractify\frontend
npm run build
```

## Troubleshooting

### MongoDB connection error

Check that MongoDB is running and that `MONGODB_URI` is correct.

### Frontend cannot reach backend

Check that:
- backend is running on `http://localhost:4000`
- frontend `.env` has `VITE_API_BASE_URL=http://localhost:4000/api`

### Large PDFs take time

This app uses background processing for extraction.
So for large PDFs, upload finishes first and extraction continues in the background until the result is ready.

## API Endpoints

- `POST /api/upload` → upload file and start background extraction
- `GET /api/results/:id` → fetch current extraction result and status
