import minioClient from '../../minio.js';

/**
 * Uploads a buffer as an object in MinIO and returns the public URL
 * @param bucket Bucket name
 * @param objectName Object name (key)
 * @param buffer Data buffer
 * @param contentType MIME type, e.g. 'image/png'
 * @returns URL string
 */
export async function uploadGameImage(
    bucket: string,
    objectName: string,
    buffer: Buffer,
    contentType: string,
): Promise<string> {
    // Ensure bucket exists
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
        await minioClient.makeBucket(bucket);
    }
    // Upload object: include size and metadata
    await minioClient.putObject(bucket, objectName, buffer, buffer.length, {
        'Content-Type': contentType,
    });
    // Return a presigned URL for accessing the object
    const url = await minioClient.presignedGetObject(bucket, objectName);
    return url;
}
