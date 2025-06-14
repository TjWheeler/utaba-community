import { NextRequest, NextResponse } from 'next/server';
import { SaveSummaryCommand } from '@/commands/storage/SaveSummaryCommand';
import { ConsoleLogger } from '@/core/logging/ConsoleLogger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = new ConsoleLogger('SummaryAPI');
  const { id } = await params;

  try {
    logger.info('Retrieving summary', { id });

    // Validate ID format
    if (!id || typeof id !== 'string' || id.length < 5) {
      return NextResponse.json(
        { error: 'Invalid summary ID' },
        { status: 400 }
      );
    }

    // Retrieve summary from storage
    const summary = SaveSummaryCommand.getSummaryById(id);

    if (!summary) {
      return NextResponse.json(
        { error: 'Summary not found' },
        { status: 404 }
      );
    }

    logger.info('Summary retrieved successfully', {
      id,
      url: summary.url,
      savedAt: summary.savedAt
    });

    return NextResponse.json({
      success: true,
      data: summary
    });

  } catch (error: any) {
    logger.error('Failed to retrieve summary', error, { id });

    return NextResponse.json(
      { 
        error: 'Failed to retrieve summary',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}