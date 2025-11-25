import { Request, Response, NextFunction } from 'express';
import supabaseStorageService, {
  FileUploadOptions,
} from '../services/supabaseStorageService.js';
import { createError } from '../middleware/errorHandler.js';

export class UploadController {
  async uploadFile(req: Request, res: Response, next: NextFunction) {
    try {
      console.log('Upload request received');
      console.log('Request body:', req.body);
      console.log('Request file:', req.file);

      if (!req.file) {
        console.log('No file uploaded');
        throw createError(400, 'No file uploaded');
      }

      const { folder, type, projectName } = req.body;

      const uploadOptions: FileUploadOptions = {
        folder: folder || 'uploads',
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        maxSize: 5 * 1024 * 1024, // 5MB
        projectName,
      };

      if (type === 'logo') {
        uploadOptions.folder = 'logo';
        uploadOptions.maxSize = 2 * 1024 * 1024; // 2MB for logos
      } else if (type === 'project-hero-image') {
        uploadOptions.folder = 'project-hero-image';
        uploadOptions.maxSize = 10 * 1024 * 1024; // 10MB for hero images
      } else if (type === 'video-thumbnail') {
        const { playbackId } = req.body;
        if (!playbackId) {
          throw createError(
            400,
            'Playback ID is required for video thumbnails'
          );
        }
        uploadOptions.folder = `project-videos/${playbackId}/thumbnail`;
        uploadOptions.maxSize = 3 * 1024 * 1024; // 3MB for video thumbnails
      } else if (type === 'project-image') {
        uploadOptions.folder = 'project-images';
        uploadOptions.maxSize = 8 * 1024 * 1024; // 8MB for project images
      } else if (type === 'project-video') {
        uploadOptions.folder = 'project-videos';
        uploadOptions.maxSize = 50 * 1024 * 1024; // 50MB for videos
        uploadOptions.allowedTypes = [
          'video/mp4',
          'video/webm',
          'video/quicktime',
        ];
      }

      console.log('Starting Supabase Storage upload...');
      const result = await supabaseStorageService.uploadFile(
        req.file,
        uploadOptions
      );
      console.log('Supabase Storage upload completed successfully');

      res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        data: {
          url: result.url,
          key: result.key,
          bucket: result.bucket,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
      });
    } catch (error) {
      console.log('Upload error:', error);
      if (error instanceof Error) {
        console.log('Error message:', error.message);
        console.log('Error stack:', error.stack);
      }
      next(error);
    }
  }

  async uploadMultipleFiles(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.files || req.files.length === 0) {
        throw createError(400, 'No files uploaded');
      }

      const { folder, type } = req.body;
      const files = req.files as Express.Multer.File[];

      const uploadOptions: FileUploadOptions = {
        folder: folder || 'uploads',
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        maxSize: 5 * 1024 * 1024, // 5MB
      };

      if (type === 'project-images') {
        uploadOptions.folder = 'project-images';
        uploadOptions.maxSize = 8 * 1024 * 1024; // 8MB for project images
      }

      const uploadPromises = files.map(file =>
        supabaseStorageService.uploadFile(file, uploadOptions)
      );

      const results = await Promise.all(uploadPromises);

      const uploadedFiles = results.map((result, index) => ({
        url: result.url,
        key: result.key,
        bucket: result.bucket,
        originalName: files[index].originalname,
        size: files[index].size,
        mimetype: files[index].mimetype,
      }));

      res.status(200).json({
        success: true,
        message: `${files.length} files uploaded successfully`,
        data: uploadedFiles,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteFile(req: Request, res: Response, next: NextFunction) {
    try {
      const { key } = req.params;

      if (!key) {
        throw createError(400, 'File key is required');
      }

      await supabaseStorageService.deleteFile(key);

      res.status(200).json({
        success: true,
        message: 'File deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getFileMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      const { key } = req.params;

      if (!key) {
        throw createError(400, 'File key is required');
      }

      const metadata = await supabaseStorageService.getFileMetadata(key);

      res.status(200).json({
        success: true,
        data: {
          key,
          lastModified: metadata.LastModified,
          size: metadata.ContentLength,
          contentType: metadata.ContentType,
          metadata: metadata.Metadata,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getSignedUploadUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const { filename, contentType, folder } = req.body;

      if (!filename || !contentType) {
        throw createError(400, 'Filename and content type are required');
      }

      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileExtension = filename.split('.').pop();
      const key = `${folder || 'uploads'}/${timestamp}-${randomString}.${fileExtension}`;

      const signedUrl = await supabaseStorageService.getSignedUploadUrl(
        key,
        contentType
      );

      res.status(200).json({
        success: true,
        data: {
          signedUrl,
          key,
          expiresIn: 3600, // 1 hour
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async createProjectFolders(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectName } = req.body;

      if (!projectName) {
        throw createError(400, 'Project name is required');
      }

      await supabaseStorageService.createProjectFolders(projectName);

      res.status(200).json({
        success: true,
        message: 'Project folder structure created successfully',
        data: {
          projectName,
          folders: [
            'logo',
            'project-images',
            'project-hero-image',
            'project-videos',
            'video-thumbnail',
          ],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async listProjectFiles(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectName } = req.params;
      const { folder } = req.query;

      if (!projectName) {
        throw createError(400, 'Project name is required');
      }

      const files = await supabaseStorageService.listProjectFiles(
        projectName,
        folder as string
      );

      res.status(200).json({
        success: true,
        message: 'Project files retrieved successfully',
        data: {
          projectName,
          folder: folder || 'all',
          files: files.map(file => ({
            key: file.Key,
            size: file.Size,
            lastModified: file.LastModified,
            url: supabaseStorageService.getPublicUrl(file.Key),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async createVideoFolder(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectName, playbackId } = req.body;

      if (!projectName) {
        throw createError(400, 'Project name is required');
      }

      if (!playbackId) {
        throw createError(400, 'Playback ID is required');
      }

      await supabaseStorageService.createVideoFolder(projectName, playbackId);

      res.status(200).json({
        success: true,
        message: 'Video folder structure created successfully',
        data: {
          projectName,
          playbackId,
          folderPath: `${projectName}/project-videos/${playbackId}/thumbnail/`,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async healthCheck(req: Request, res: Response, next: NextFunction) {
    try {
      const testKey = 'health-check/test.txt';
      const exists = await supabaseStorageService.fileExists(testKey);

      res.status(200).json({
        success: true,
        message: 'S3 service is healthy',
        data: {
          bucketExists: true,
          testFileExists: exists,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
