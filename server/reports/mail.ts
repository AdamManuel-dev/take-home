import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

export type ReportMail = {
  reportId: string;
  messageId: string;
  to: string;
  subject: string;
  text: string;
  attachment: {
    filename: string;
    contentType: "application/pdf";
    content: Buffer;
  };
};
export interface ReportMailer {
  send(message: ReportMail): Promise<{ responseId: string }>;
}

/** Test transport: captures each attempted acceptance and never contacts an email provider. */
export class CaptureMailer implements ReportMailer {
  readonly messages: ReportMail[] = [];
  async send(message: ReportMail) {
    this.messages.push({
      ...message,
      attachment: {
        ...message.attachment,
        content: Buffer.from(message.attachment.content),
      },
    });
    return { responseId: `capture-${this.messages.length}` };
  }
}

/** Default demo transport: atomically saves a message and PDF without sending real email. */
export class FileCaptureMailer implements ReportMailer {
  constructor(
    private directory = resolve(
      process.env.MAIL_CAPTURE_DIR || "data/mail-capture",
    ),
  ) {}
  async send(message: ReportMail) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const key = createHash("sha256").update(message.messageId).digest("hex");
    const destination = join(this.directory, key);
    const responseId = `file-capture-${key}`;
    if (existsSync(destination)) {
      const saved = JSON.parse(
        readFileSync(join(destination, "message.json"), "utf8"),
      );
      if (saved.messageId !== message.messageId)
        throw new Error("Capture identity mismatch");
      return { responseId };
    }
    const temporary = join(this.directory, `.${key}.${randomUUID()}.tmp`);
    mkdirSync(temporary, { mode: 0o700 });
    try {
      writeFileSync(
        join(temporary, "attachment.pdf"),
        message.attachment.content,
        { mode: 0o600, flag: "wx" },
      );
      const { content: _content, ...attachment } = message.attachment;
      writeFileSync(
        join(temporary, "message.json"),
        JSON.stringify(
          {
            ...message,
            attachment: { ...attachment, path: "attachment.pdf" },
            responseId,
          },
          null,
          2,
        ),
        { mode: 0o600, flag: "wx" },
      );
      renameSync(temporary, destination);
    } catch (error) {
      rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
    return { responseId };
  }
}
