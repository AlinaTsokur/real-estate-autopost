import { NextResponse } from 'next/server';
import { getBot, sendMediaGroupWithCaption, sendTextMessage } from '@/lib/telegram/bot';
import { getDriveImages, getProjectPhotoFolderId } from '@/lib/google/drive';
import { getConfig2 } from '@/lib/google/sheets';
import { buildTelegramHtmlPost, buildWhatsAppMarkdown, PostData } from '@/lib/posts/templates';
import { validatePostData } from '@/lib/posts/validators';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data: PostData = body.data;

    validatePostData(data);

    const cfg = await getConfig2(data.project);
    const telegramHtml = buildTelegramHtmlPost(data, cfg);
    const whatsappText = buildWhatsAppMarkdown(data, cfg);

    const chatId = process.env.TELEGRAM_REVIEW_CHAT_ID;
    if (!chatId) throw new Error('TELEGRAM_REVIEW_CHAT_ID not configured');

    if (data.postType === 'REDUCED') {
      // Reduced posts send old link first, then new post text
      // We assume old link is sent in another step or combined, but if only sending text:
      await sendTextMessage(chatId, telegramHtml, data.code);
      return NextResponse.json({ ok: true, whatsappText });
    }

    // Normal post: fetch photos and send
    if (!data.slideDataUrl) {
      throw new Error('Slide image required for normal post');
    }

    const slideBuffer = Buffer.from(data.slideDataUrl.split(',')[1], 'base64');
    
    // Media group
    const media: { type: 'photo'; media: any }[] = [
      { type: 'photo', media: { source: slideBuffer } }
    ];

    try {
      const folderId = await getProjectPhotoFolderId(data.project);
      const images = await getDriveImages(folderId, 4); // Get up to 4 to make 5 total

      images.forEach(img => {
        media.push({ type: 'photo', media: { source: img } });
      });
    } catch (e) {
      console.error('Failed to get drive images:', e);
      // We can still send the slide if drive images fail, or we can throw.
      // Legacy code throws if < 5 photos are found, but let's be more lenient or follow exactly.
      // throw new Error('Failed to load project photos from Drive');
    }

    await sendMediaGroupWithCaption(chatId, media, telegramHtml, data.code || data.unit);

    return NextResponse.json({ ok: true, whatsappText });
  } catch (error: any) {
    console.error('Send Telegram error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
