import { StorageService } from "./storage.service";

/**
 * Story 27 — cobertura de storage (S3.10). Geração de URL pré-assinada (SigV4)
 * e upload server-side via fetch mockado (MinIO/S3). Sem rede real.
 */

const ENV: Record<string, string> = {
  STORAGE_ENDPOINT: "http://localhost:9002/",
  STORAGE_REGION: "us-east-1",
  STORAGE_BUCKET: "markethub",
  STORAGE_ACCESS_KEY: "markethub",
  STORAGE_SECRET_KEY: "markethub123",
};

function makeConfig(over: Record<string, string | undefined> = {}) {
  const env = { ...ENV, ...over };
  return {
    get: (key: string) => env[key],
  };
}

function makeService(over: Record<string, string | undefined> = {}) {
  return new StorageService(makeConfig(over) as never);
}

describe("StorageService", () => {
  describe("presignUpload", () => {
    it("gera uma URL pré-assinada (SigV4) com query e assinatura", () => {
      const svc = makeService();

      const out = svc.presignUpload("products/p1.jpg", "image/jpeg");

      const url = new URL(out.uploadUrl);
      expect(url.origin).toBe("http://localhost:9002");
      expect(url.pathname).toBe("/markethub/products/p1.jpg");
      expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
      expect(url.searchParams.get("X-Amz-Credential")).toContain("markethub/");
      expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
      expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
      expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    });

    it("retorna headers, publicUrl e expiração default", () => {
      const svc = makeService();

      const out = svc.presignUpload("products/p1.jpg", "image/png");

      expect(out.headers).toEqual({ "Content-Type": "image/png" });
      expect(out.publicUrl).toBe("http://localhost:9002/markethub/products/p1.jpg");
      expect(out.expiresInSeconds).toBe(900);
    });

    it("respeita expiração customizada", () => {
      const svc = makeService();

      const out = svc.presignUpload("a/b.jpg", "image/jpeg", 60);

      expect(out.expiresInSeconds).toBe(60);
      expect(new URL(out.uploadUrl).searchParams.get("X-Amz-Expires")).toBe("60");
    });

    it("usa STORAGE_PUBLIC_URL como base pública quando definido", () => {
      const svc = makeService({ STORAGE_PUBLIC_URL: "https://cdn.markethub.app" });

      const out = svc.presignUpload("products/p1.jpg", "image/jpeg");

      expect(out.publicUrl).toBe("https://cdn.markethub.app/products/p1.jpg");
    });

    it("preserva as barras da key ao codificar segmentos", () => {
      const svc = makeService();

      const out = svc.presignUpload("products/sub dir/imagem final.jpg", "image/jpeg");

      expect(out.publicUrl).toBe(
        "http://localhost:9002/markethub/products/sub%20dir/imagem%20final.jpg",
      );
    });

    it("produz assinaturas distintas para keys distintas", () => {
      const svc = makeService();

      const a = svc.presignUpload("a.jpg", "image/jpeg");
      const b = svc.presignUpload("b.jpg", "image/jpeg");

      const sigA = new URL(a.uploadUrl).searchParams.get("X-Amz-Signature");
      const sigB = new URL(b.uploadUrl).searchParams.get("X-Amz-Signature");
      expect(sigA).not.toBe(sigB);
    });
  });

  describe("uploadBuffer", () => {
    const original = global.fetch;
    afterEach(() => {
      global.fetch = original;
    });

    it("faz PUT assinado dos bytes e retorna a publicUrl", async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = fetchMock as never;
      const svc = makeService();

      const url = await svc.uploadBuffer(
        "products/p1.jpg",
        Buffer.from("bytes"),
        "image/jpeg",
      );

      expect(url).toBe("http://localhost:9002/markethub/products/p1.jpg");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [target, init] = fetchMock.mock.calls[0];
      expect(target).toBe("http://localhost:9002/markethub/products/p1.jpg");
      expect(init.method).toBe("PUT");
      expect(init.headers["Content-Type"]).toBe("image/jpeg");
      expect(init.headers["x-amz-content-sha256"]).toMatch(/^[a-f0-9]{64}$/);
      expect(init.headers.Authorization).toContain("AWS4-HMAC-SHA256 Credential=markethub/");
      expect(init.headers.Authorization).toContain(
        "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date",
      );
      expect(init.body).toBeInstanceOf(Buffer);
    });

    it("usa a base pública customizada no retorno", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as never;
      const svc = makeService({ STORAGE_PUBLIC_URL: "https://cdn.markethub.app" });

      const url = await svc.uploadBuffer("k.png", Buffer.from("x"), "image/png");

      expect(url).toBe("https://cdn.markethub.app/k.png");
    });

    it("lança quando o storage (MinIO/S3) responde erro", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as never;
      const svc = makeService();

      await expect(
        svc.uploadBuffer("k.jpg", Buffer.from("x"), "image/jpeg"),
      ).rejects.toThrow("Storage upload failed 403");
    });

    it("propaga erro de rede do fetch", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as never;
      const svc = makeService();

      await expect(
        svc.uploadBuffer("k.jpg", Buffer.from("x"), "image/jpeg"),
      ).rejects.toThrow("ECONNREFUSED");
    });
  });
});
