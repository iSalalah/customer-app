import { ApiError } from '../../utils/ApiError.js';
import { serializePublicTracking } from '../../utils/serializers.js';
import * as requestsRepository from '../requests/requests.repository.js';

/**
 * Public tracking.
 *
 * The repository projection selects four columns, so there is no citizen name,
 * phone number, description, attachment, staff identity or internal note in
 * memory to leak by accident. The status is coarsened on the way out
 * (see docs/04-workflow.md) so approvals and rejections are indistinguishable.
 */
export async function trackByReference(referenceNumber) {
  const request = await requestsRepository.findPublicTracking(referenceNumber);

  // An unknown reference and a rate-limited one must look alike to a scraper;
  // both are plain 404 with no hint about which references exist.
  if (!request) {
    throw ApiError.notFound('No request was found with that reference number.');
  }

  return serializePublicTracking(request);
}
