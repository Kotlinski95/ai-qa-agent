import '../env';
import { scheduledRefreshHandler } from '@services/content-refresh';

export const handler = scheduledRefreshHandler;
