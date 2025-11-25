import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createError } from '../middleware/errorHandler.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET_NAME =
  process.env.SUPABASE_BUCKET_NAME || 'project-assets';

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

console.log('Configuring Supabase Storage...');
console.log('Supabase URL:', SUPABASE_URL);
console.log('Bucket Name:', SUPABASE_BUCKET_NAME);

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  size: number;
}

export interface FileUploadOptions {
  folder?: string;
  allowedTypes?: string[];
  maxSize?: number;
  projectName?: string;
}

export class SupabaseStorageService {
  private static instance: SupabaseStorageService;
  private supabase: SupabaseClient;
  private bucketName: string;

  private constructor() {
    this.supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.bucketName = SUPABASE_BUCKET_NAME;
  }

  public static getInstance(): SupabaseStorageService {
    if (!SupabaseStorageService.instance) {
      SupabaseStorageService.instance = new SupabaseStorageService();
    }
    return SupabaseStorageService.instance;
  }

  /**
   * Initialize bucket if it doesn't exist
   */
  async initializeBucket(): Promise<void> {
    try {
      const { data: buckets, error: listError } =
        await this.supabase.storage.listBuckets();

      if (listError) {
        console.error('Error listing buckets:', listError);
        return;
      }

      const bucketExists = buckets?.some(
        bucket => bucket.name === this.bucketName
      );

      if (!bucketExists) {
        console.log(`Creating bucket: ${this.bucketName}`);
        const { error: createError } = await this.supabase.storage.createBucket(
          this.bucketName,
          {
            public: true,
            fileSizeLimit: 52428800, // 50MB
            allowedMimeTypes: [
              'image/jpeg',
              'image/png',
              'image/gif',
              'image/webp',
              'video/mp4',
              'video/webm',
              'video/quicktime',
            ],
          }
        );

        if (createError) {
          console.error('Error creating bucket:', createError);
        } else {
          console.log(`Bucket ${this.bucketName} created successfully`);
        }
      } else {
        console.log(`Bucket ${this.bucketName} already exists`);
      }
    } catch (error) {
      console.error('Error initializing bucket:', error);
    }
  }

  /**
   * Upload a file to Supabase Storage
   */
  async uploadFile(
    file: Express.Multer.File,
    options: FileUploadOptions = {}
  ): Promise<UploadResult> {
    try {
      console.log('Starting Supabase Storage upload...');
      console.log('File name:', file.originalname);
      console.log('File size:', file.size, 'bytes');
      console.log('File mimetype:', file.mimetype);

      const {
        folder = 'uploads',
        allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        maxSize = 5 * 1024 * 1024,
        projectName,
      } = options;

      // Validate file type
      if (!allowedTypes.includes(file.mimetype)) {
        throw createError(
          400,
          `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
        );
      }

      // Validate file size
      if (file.size > maxSize) {
        throw createError(
          400,
          `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`
        );
      }

      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `${timestamp}-${randomString}.${fileExtension}`;

      let key: string;
      if (projectName) {
        const sanitizedProjectName = projectName
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-');
        key = `${sanitizedProjectName}/${folder}/${fileName}`;
      } else {
        key = `${folder}/${fileName}`;
      }

      console.log('Uploading to bucket:', this.bucketName);
      console.log('Key:', key);

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(key, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Supabase upload error:', error);
        throw createError(500, `Upload failed: ${error.message}`);
      }

      console.log('Upload successful!');

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(key);

      const uploadResult = {
        url: urlData.publicUrl,
        key: key,
        bucket: this.bucketName,
        size: file.size,
      };

      console.log('Upload completed successfully:', uploadResult);
      return uploadResult;
    } catch (error) {
      console.error('Supabase Storage upload error:', error);

      if (
        error instanceof Error &&
        (error.message.includes('Invalid file type') ||
          error.message.includes('File too large'))
      ) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw createError(500, `Failed to upload file: ${errorMessage}`);
    }
  }

  /**
   * Delete a file from Supabase Storage
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([key]);

      if (error) {
        console.error('Supabase delete error:', error);
        throw createError(500, `Failed to delete file: ${error.message}`);
      }
    } catch (error) {
      console.error('Supabase Storage delete error:', error);
      throw createError(500, 'Failed to delete file from storage');
    }
  }

  /**
   * Get a signed URL for uploading (for direct client uploads)
   */
  async getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .createSignedUploadUrl(key);

      if (error) {
        throw createError(
          500,
          `Failed to generate signed URL: ${error.message}`
        );
      }

      return data.signedUrl;
    } catch (error) {
      console.error('Supabase signed URL error:', error);
      throw createError(500, 'Failed to generate signed upload URL');
    }
  }

  /**
   * Get a signed URL for downloading (for private files)
   */
  async getSignedDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .createSignedUrl(key, expiresIn);

      if (error) {
        throw createError(
          500,
          `Failed to generate signed URL: ${error.message}`
        );
      }

      return data.signedUrl;
    } catch (error) {
      console.error('Supabase signed URL error:', error);
      throw createError(500, 'Failed to generate signed download URL');
    }
  }

  /**
   * Check if a file exists in storage
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list(key.substring(0, key.lastIndexOf('/')), {
          search: key.substring(key.lastIndexOf('/') + 1),
        });

      if (error) {
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file metadata from storage
   */
  async getFileMetadata(key: string): Promise<any> {
    try {
      const folder = key.substring(0, key.lastIndexOf('/'));
      const fileName = key.substring(key.lastIndexOf('/') + 1);

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list(folder, {
          search: fileName,
        });

      if (error || !data || data.length === 0) {
        throw createError(404, 'File not found');
      }

      const fileInfo = data[0];
      return {
        name: fileInfo.name,
        size: fileInfo.metadata?.size,
        lastModified: fileInfo.updated_at,
        contentType: fileInfo.metadata?.mimetype,
      };
    } catch (error) {
      console.error('Supabase metadata error:', error);
      throw createError(500, 'Failed to get file metadata');
    }
  }

  /**
   * Create project folder structure (no-op for Supabase, folders are virtual)
   */
  async createProjectFolders(projectName: string): Promise<void> {
    console.log(
      'Project folders are virtual in Supabase Storage:',
      projectName
    );
    // Supabase Storage uses virtual folders, no need to create them explicitly
  }

  /**
   * Create video-specific folder structure (no-op for Supabase)
   */
  async createVideoFolder(
    projectName: string,
    playbackId: string
  ): Promise<void> {
    console.log('Video folders are virtual in Supabase Storage:', {
      projectName,
      playbackId,
    });
    // Supabase Storage uses virtual folders, no need to create them explicitly
  }

  /**
   * List all files in a project folder
   */
  async listProjectFiles(projectName: string, folder?: string): Promise<any[]> {
    try {
      const sanitizedProjectName = projectName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');
      const prefix = folder
        ? `${sanitizedProjectName}/${folder}`
        : sanitizedProjectName;

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list(prefix, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        console.error('Supabase list files error:', error);
        throw createError(500, `Failed to list files: ${error.message}`);
      }

      return (data || []).map(file => ({
        Key: `${prefix}/${file.name}`,
        Size: file.metadata?.size,
        LastModified: file.updated_at,
      }));
    } catch (error) {
      console.error('Supabase Storage list files error:', error);
      throw createError(500, 'Failed to list project files');
    }
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(key: string): string {
    const { data } = this.supabase.storage
      .from(this.bucketName)
      .getPublicUrl(key);

    return data.publicUrl;
  }
}

export default SupabaseStorageService.getInstance();
