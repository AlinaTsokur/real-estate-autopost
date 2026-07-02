import { NextResponse } from 'next/server';
import { getBot, sendMediaGroupWithCaption, sendTextMessage, sendPlainTextMessage, sendPhoto, updateReviewMessage } from '@/lib/telegram/bot';
import { getDriveImages, getProjectPhotoFolderId, uploadToWaQueue } from '@/lib/google/drive';
import { getConfig2, addWaQueueItem } from '@/lib/google/sheets';
import { buildTelegramHtmlPost, buildWhatsAppMarkdown, PostData } from '@/lib/posts/templates';
import { validatePostData } from '@/lib/posts/validators';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data: PostData = body.data;

    validatePostData(data);

    const cfg = await getConfig2(data.project);
    const telegramHtml = await buildTelegramHtmlPost(data);
    const whatsappText = await buildWhatsAppMarkdown(data);

    const chatId = process.env.TELEGRAM_REVIEW_CHAT_ID;
    if (!chatId) throw new Error('TELEGRAM_REVIEW_CHAT_ID not configured');

    if (data.postType === 'PRICE_CHANGE') {
      const allIds: number[] = [];
      if (data.oldPostUrl) {
        const r = await sendPlainTextMessage(chatId, data.oldPostUrl);
        allIds.push(...r.ids);
      }
      const r1 = await sendTextMessage(chatId, telegramHtml, data.code);
      allIds.push(...r1.ids);
      const r2 = await sendPlainTextMessage(chatId, whatsappText);
      allIds.push(...r2.ids);
      if (r1.reviewMsgId) {
        await updateReviewMessage(chatId, r1.reviewMsgId, data.code || '', allIds).catch(() => {});
      }

      try {
        const label = `PRICE_CHANGE – ${data.code || data.unit || '?'} in ${data.project}`;
        await addWaQueueItem(label, whatsappText, '');
      } catch (e) {
        console.error('WA queue save error (price change):', e);
      }

      return NextResponse.json({ ok: true, whatsappText, messageIds: allIds, chatId });
    }

    // Normal post: fetch photos and send
    if (!data.slideDataUrl) {
      throw new Error('Slide image required for normal post');
    }

    const slideBuffer = Buffer.from(data.slideDataUrl.split(',')[1], 'base64');
    
    // Media group
    const media: { type: 'photo'; media: any }[] = [
      { type: 'photo', media: { source: slideBuffer, filename: 'slide.jpg' } }
    ];

    try {
      const folderId = await getProjectPhotoFolderId(data.project);
      const images = await getDriveImages(folderId, 5); // Get up to 5 to make 6 total with slide

      images.forEach((img, i) => {
        media.push({ type: 'photo', media: { source: img, filename: `img_${i}.jpg` } });
      });
    } catch (e) {
      console.error('Failed to get drive images:', e);
      // We can still send the slide if drive images fail, or we can throw.
      // Legacy code throws if < 5 photos are found, but let's be more lenient or follow exactly.
      // throw new Error('Failed to load project photos from Drive');
    }

    console.log(`Sending telegram media group with ${media.length} items`);

    const r1 = await sendMediaGroupWithCaption(chatId, media, telegramHtml, data.code || data.unit || 'Unknown');
    const allIds: number[] = [...r1.ids];

    const r2 = await sendPhoto(chatId, slideBuffer, whatsappText);
    allIds.push(...r2.ids);

    await updateReviewMessage(chatId, r1.reviewMsgId, data.code || data.unit || 'Unknown', allIds).catch(() => {});

    try {
      const label = `${data.postType} – ${data.code || data.unit || '?'} in ${data.project}`;
      const filename = `wa_${Date.now()}.jpg`;
      const driveFileId = await uploadToWaQueue(slideBuffer, filename);
      await addWaQueueItem(label, whatsappText, driveFileId);
    } catch (e) {
      console.error('WA queue save error:', e);
    }

    return NextResponse.json({ ok: true, whatsappText, messageIds: allIds, chatId });
  } catch (error: any) {
    console.error('Send Telegram error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
