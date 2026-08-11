declare module "selenium-webdriver/io/zip.js" {
  export class Zip {
    addDir(dirPath: string, zipPath?: string): Promise<void>;
    toBuffer(compression?: string): Promise<Buffer>;
  }
}
