import { createHash, createHmac } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";

export interface PresignedUpload {
  /** URL para o cliente fazer PUT do arquivo (expira). */
  uploadUrl: string;
  /** URL pública final do objeto (gravada como imageUrl). */
  publicUrl: string;
  /** Header obrigatório no PUT. */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/**
 * Geração de URL pré-assinada (AWS SigV4) para upload direto ao S3/MinIO, sem
 * SDK — o cliente faz PUT na URL e depois envia a publicUrl ao cadastro (S3.10).
 */
@Injectable()
export class StorageService {
  private readonly endpoint: string;
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly publicBase: string;

  constructor(config: ConfigService<Env, true>) {
    this.endpoint = config.get("STORAGE_ENDPOINT", { infer: true }).replace(/\/$/, "");
    this.region = config.get("STORAGE_REGION", { infer: true });
    this.bucket = config.get("STORAGE_BUCKET", { infer: true });
    this.accessKey = config.get("STORAGE_ACCESS_KEY", { infer: true });
    this.secretKey = config.get("STORAGE_SECRET_KEY", { infer: true });
    this.publicBase =
      config.get("STORAGE_PUBLIC_URL", { infer: true }) ?? `${this.endpoint}/${this.bucket}`;
  }

  /** Presigna um PUT (path-style, como o MinIO usa). */
  presignUpload(key: string, contentType: string, expiresInSeconds = 900): PresignedUpload {
    const url = new URL(`${this.endpoint}/${this.bucket}/${encodeKey(key)}`);
    const host = url.host;
    const now = new Date();
    const amzDate = toAmzDate(now); // 20260601T183000Z
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;

    const params: Record<string, string> = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.accessKey}/${credentialScope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresInSeconds),
      "X-Amz-SignedHeaders": "host",
    };
    const canonicalQuery = Object.keys(params)
      .sort()
      .map((k) => `${enc(k)}=${enc(params[k])}`)
      .join("&");

    const canonicalRequest = [
      "PUT",
      url.pathname,
      canonicalQuery,
      `host:${host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const signingKey = this.signingKey(dateStamp);
    const signature = hmacHex(signingKey, stringToSign);

    const uploadUrl = `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;

    return {
      uploadUrl,
      publicUrl: `${this.publicBase}/${encodeKey(key)}`,
      headers: { "Content-Type": contentType },
      expiresInSeconds,
    };
  }

  private signingKey(dateStamp: string): Buffer {
    const kDate = hmac(`AWS4${this.secretKey}`, dateStamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, "s3");
    return hmac(kService, "aws4_request");
  }
}

function toAmzDate(d: Date): string {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function enc(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Codifica a key preservando as barras de "pasta". */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((seg) => enc(seg))
    .join("/");
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function hmacHex(key: Buffer, data: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}
