import { NextRequest, NextResponse } from 'next/server';
import { SaveSummaryCommand } from '@/commands/storage/SaveSummaryCommand';
import { ConsoleLogger } from '@/core/logging/ConsoleLogger';

export async function GET(request: NextRequest) {
  const logger = new ConsoleLogger('SummariesAPI');

  try {
    logger.info('Listing all summaries');

    // Get storage statistics and summary list
    const stats = SaveSummaryCommand.getStorageStats();
    const summaryIds = SaveSummaryCommand.listSummaries();

    // Retrieve summary metadata for each ID
    const summaries = summaryIds.map(id => {
      const summary = SaveSummaryCommand.getSummaryById(id);
      if (!summary) return null;

      // Return lightweight version with metadata only
      return {
        id,
        url: summary.url,
        title: summary.summary?.metadata?.title || 'Untitled',
        savedAt: summary.savedAt,
        summaryLength: summary.summary?.summary?.length || 0,
        keyPointsCount: summary.summary?.keyPoints?.length || 0,
        sentiment: summary.summary?.sentiment,
        shareUrl: `/api/summaries/${id}`
      };
    }).filter(Boolean);

    // Sort by savedAt (most recent first)
    summaries.sort((a, b) => new Date(b!.savedAt).getTime() - new Date(a!.savedAt).getTime());

    logger.info('Summaries listed successfully', {
      count: summaries.length,
      totalSize: stats.totalSize
    });

    return NextResponse.json({
      success: true,
      data: {
        summaries,
        stats: {
          count: stats.count,
          totalSize: stats.totalSize,
          totalSizeFormatted: formatBytes(stats.totalSize)
        }
      }
    });

  } catch (error: any) {
    logger.error('Failed to list summaries', error);

    return NextResponse.json(
      { 
        error: 'Failed to list summaries',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}