import { PRESENTATIONS, getTomorrowDateTag, getCanvaAccessToken, exportDesignAsPdf, downloadFile } from '@/lib/canva/api';
import { compressPdf } from '@/lib/ilovepdf/compress';
import { sendDocument, sendMessage } from '@/lib/telegram/mtproto';
import { pdfToThumb } from '@/lib/pdf-thumb';

export const maxDuration = 300;

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST() {
  const chatId = process.env.CANVA_PRESENTATIONS_CHAT_ID;
  if (!chatId) {
    return new Response(JSON.stringify({ error: 'CANVA_PRESENTATIONS_CHAT_ID not configured' }), { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(sseEvent(data)));

      try {
        send({ type: 'start', total: PRESENTATIONS.length });

        const dateTag = getTomorrowDateTag();
        const accessToken = await getCanvaAccessToken();
        send({ type: 'log', message: '✅ Canva авторизация успешна' });

        const failed: string[] = [];

        for (let i = 0; i < PRESENTATIONS.length; i++) {
          const p = PRESENTATIONS[i];
          const filename = `${p.name} ${dateTag}.pdf`;

          try {
            send({ type: 'progress', index: i, name: p.name, step: 'export' });
            const downloadUrl = await exportDesignAsPdf(p.id, accessToken);

            send({ type: 'progress', index: i, name: p.name, step: 'download' });
            const pdfBuffer = await downloadFile(downloadUrl);

            send({ type: 'progress', index: i, name: p.name, step: 'compress' });
            const compressed = await compressPdf(pdfBuffer, filename);

            const thumb = await pdfToThumb(compressed);

            send({ type: 'progress', index: i, name: p.name, step: 'send' });
            await sendDocument(chatId, compressed, filename, thumb);

            send({ type: 'done', index: i, name: p.name, filename });
          } catch (err: any) {
            failed.push(p.name);
            send({ type: 'error', index: i, name: p.name, message: err.message });
          }
        }

        const total = PRESENTATIONS.length;
        const sent = total - failed.length;
        let summary = `✅ Отправлено ${sent} из ${total}`;
        if (failed.length > 0) {
          summary += `\n\n❌ Не отправились:\n${failed.map(n => `• ${n}`).join('\n')}`;
        }
        await sendMessage(chatId, summary);

        send({ type: 'finish' });
      } catch (err: any) {
        send({ type: 'fatal', message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
