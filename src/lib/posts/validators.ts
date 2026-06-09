import { PostData } from './templates';
import { isVillaObject } from './formatters';

export function validatePostData(data: Partial<PostData>): void {
  if (!data.postType) throw new Error('Choose Post Type');
  if (!data.project) throw new Error('Choose Project');
  if (data.sellingPrice === '' || data.sellingPrice === undefined) throw new Error('Selling Price is missing');

  if (data.postType === 'PRICE_CHANGE') {
    if (!data.code) throw new Error('Code is required for price change post');
    if (data.oldPrice === '' || data.oldPrice === undefined) throw new Error('Enter Old Price manually');
    // We no longer throw if sellingPrice >= oldPrice, because we support price increases!
    return;
  }

  if (!data.type) throw new Error('Type is missing');
  if (!data.handover) throw new Error('Enter Handover');
  
  // slide is manually validated in the UI before API call or passed to API, but let's check
  if (!data.slideDataUrl && !data.slideName) {
    // For MVP, we might upload via Next.js API, so we'll just check if it's there
    // If not doing image upload in this function, we can skip
  }

  if (data.postType === 'NEW_PRICE' && (data.oldPrice === '' || data.oldPrice === undefined)) {
    throw new Error('Old Price is required for NEW PRICE posts');
  }

  if (isVillaObject(data.objectType || 'Apartment')) {
    if (data.grossAreaM2 === '' || data.grossAreaM2 === undefined) {
      throw new Error('Gross Area (m2) is required for Villa/Townhouse/Condo');
    }
  } else {
    if (data.areaM2 === '' || data.areaM2 === undefined) {
      throw new Error('Area (m2) is required for Apartment');
    }
    if (!data.floor) {
      throw new Error('Floor is required for Apartment');
    }
  }
}
