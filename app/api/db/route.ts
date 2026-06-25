import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Ensure the data directory and db.json file exist with default contents
async function ensureDb() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (e) {
    // Directory already exists or can't be created
  }

  try {
    await fs.access(DB_FILE);
  } catch (e) {
    // File doesn't exist, initialize with empty structure
    const defaultData = {
      progress: {
        masteredIds: [],
        starredIds: [],
        notes: {}
      },
      cardCache: {}
    };
    await fs.writeFile(DB_FILE, JSON.stringify(defaultData, null, 2), "utf-8");
  }
}

export async function GET() {
  try {
    await ensureDb();
    const fileContent = await fs.readFile(DB_FILE, "utf-8");
    const data = JSON.parse(fileContent);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Failed to read database file:", error);
    return NextResponse.json({ error: "Failed to load database" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await ensureDb();
    
    // Read current data first to prevent wiping out other keys if only one is updated
    const fileContent = await fs.readFile(DB_FILE, "utf-8");
    const currentData = JSON.parse(fileContent);
    
    const updatedData = {
      progress: body.progress !== undefined ? body.progress : currentData.progress,
      cardCache: body.cardCache !== undefined ? body.cardCache : currentData.cardCache,
    };

    await fs.writeFile(DB_FILE, JSON.stringify(updatedData, null, 2), "utf-8");
    return NextResponse.json({ success: true, data: updatedData });
  } catch (error: any) {
    console.error("Failed to write to database file:", error);
    return NextResponse.json({ error: "Failed to save to database" }, { status: 500 });
  }
}
