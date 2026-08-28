import { Editor } from '@bytemd/react';
import gfm from '@bytemd/plugin-gfm';
import 'bytemd/dist/index.css';
import './markdownCode.css';
import { tokenStore } from '@/utils/token';
import { normalizeTextCodeBlock } from './bytemdPlugins';

interface Props {
  value?: string;
  onChange?: (value: string) => void;
}

interface UploadResp {
  fileName: string;
  fileType: 'doc' | 'image';
  url: string;
}

async function uploadToServer(file: File, kind: 'requirement' | 'design'): Promise<UploadResp> {
  const form = new FormData();
  form.append('files', file);
  form.append('kind', kind);
  const resp = await fetch('/api/requirements/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenStore.getAccess()}` },
    body: form,
  });
  const json = (await resp.json()) as { data?: UploadResp[] };
  const item = json.data?.[0];
  if (!item) throw new Error('上传失败');
  return item;
}

/** ByteMD 编辑器：图片通过工具栏 / 粘贴 / 拖拽上传并插入 */
export function MarkdownEditor({ value, onChange }: Props) {
  const uploadImages = async (files: File[]) => {
    const items = await Promise.all(files.map((f) => uploadToServer(f, 'design')));
    return items.map((item) => ({ url: item.url, alt: item.fileName, title: item.fileName }));
  };

  return (
    <Editor
      value={value ?? ''}
      onChange={(v) => onChange?.(v)}
      plugins={[gfm(), normalizeTextCodeBlock()]}
      uploadImages={uploadImages}
      placeholder="支持 Markdown，可通过工具栏 / 粘贴 / 拖拽上传图片"
    />
  );
}

export default MarkdownEditor;
