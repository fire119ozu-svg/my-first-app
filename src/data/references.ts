/**
 * 参考資料(現場で確認する基準表・要領など)。
 * アプリに同梱し、オフラインでも閲覧できる。
 *
 * - text  : 本文をアプリ内で表示(見出しごとの区切りに対応)
 * - image : public/references/ に置いた画像を表示(拡大可)
 */
export type ReferenceDoc =
  | {
      id: string;
      kind: 'text';
      title: string;
      category: string;
      /** 一覧に表示する補足 */
      description?: string;
      sections: { heading?: string; body: string }[];
    }
  | {
      id: string;
      kind: 'image';
      title: string;
      category: string;
      description?: string;
      /** public/references/ からの相対パス */
      files: string[];
    };

export const REFERENCES: ReferenceDoc[] = [];
