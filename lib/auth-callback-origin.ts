import { isProductionDeployment } from '@/lib/browser-request-origin';
import { SITE_URL } from '@/lib/seo-config';

/** Callback destinations are application policy, never proxy header input. */
export function authCallbackOrigin(request: Request): string {
  return isProductionDeployment() ? SITE_URL : new URL(request.url).origin;
}
