// services/r2.js — Cloudflare R2 (compatible con AWS S3 SDK)
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

/**
 * Generar URL firmada para SUBIR un archivo (upload directo desde el browser)
 * El frontend sube directamente a R2, sin pasar por nuestro servidor
 */
async function getUploadPresignedUrl({ folder = 'videos', contentType, extension }) {
  const key = `${folder}/${uuidv4()}.${extension}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(r2, command, { expiresIn: 3600 }); // 1 hora
  return { url, key };
}

/**
 * Generar URL firmada para VER/REPRODUCIR un video (streaming privado)
 * Válida por 2 horas — se renueva cuando el alumno abre la lección
 */
async function getStreamingUrl(key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(r2, command, { expiresIn: 7200 }); // 2 horas
}

/**
 * Eliminar archivo de R2
 */
async function deleteFile(key) {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * URL pública (solo para thumbnails/PDFs públicos en un bucket público)
 */
function getPublicUrl(key) {
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

module.exports = { getUploadPresignedUrl, getStreamingUrl, deleteFile, getPublicUrl };
