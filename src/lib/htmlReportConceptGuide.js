/**
 * HTML レポート用ゆっくりガイド（この拡張の説明／保存ページの使い方）
 * 表示名「君斗りんくの追憶のきらめき」。ファイル名等の識別子に nicolivelog が残る。「動員ちゃれんじ」（doin-challenge.com）と文脈でリンク。
 */

/** @typedef {{ avatarLinkHtml: string, avatarKontaHtml: string, avatarTanuHtml: string }} YukkuriReportAvatars */

const CONCEPT_H2 = 'この拡張について（君斗りんくの追憶のきらめき）';
/** 折りたたみ前に常に見える短いリード */
const CONCEPT_TEASER_LEAD =
  'このブラウザ拡張の呼び名は「君斗りんくの追憶のきらめき」なのだ。ニコニコ生放送の応援コメントをこのPCに記録し、応援の可視化やあとからの振り返りにつなげるのだ。詳しい文脈は、下の折りたたみを開いてほしいのだ。';

const CONCEPT_READ_MORE_1_BODY = `
          <p class="concept-read-more__prose">
            ダウンロードする HTML のファイル名などには、開発識別子として <strong>nicolivelog</strong>
            が付くことがあるのだ。Chrome の拡張一覧に表示される名前は「君斗りんくの追憶のきらめき」なのだ。
          </p>
          <p class="concept-read-more__prose">
            基本の視聴は外部プラットフォーム上で起きるのだ。だから「サイトに来たユニーク」だけでは、応援の全体像は見えにくいのだ。この拡張は、コメントという<strong>応援の痕跡</strong>をローカルに残し、主催側もファン側も「ちゃんとあった」と確認しやすくするのだ。
          </p>
          <p class="concept-read-more__prose">
            ニコ生の<strong>累計来場者数</strong>（配信ページの statistics.watchCount 相当）は、<a href="https://nicodb.net/" target="_blank" rel="noopener noreferrer">NicoDB（nicodb.net）</a> の「来場者数」と同系で比較しやすいのだ。下の「来場（応援コメント）」の話とは<strong>別の定義</strong>なのだ。
          </p>
          <p class="concept-read-more__prose">
            今後、X（旧Twitter）などチャネルが増えても、<strong>定義をすり替えずに</strong>同じ考え方でそろえていきたいのだ。用語の定義ページを別途用意し、「来場」「応援ログ」などを共有しておくイメージなのだ。
          </p>
          <p class="concept-read-more__prose">
            <strong>動員ちゃれんじ</strong>（<a href="https://doin-challenge.com/" target="_blank" rel="noopener noreferrer">doin-challenge.com</a>）は、この拡張と<strong>文脈でリンクしている関連の取り組み</strong>なのだ。サイト側のコンセプトと、ここで残るコメント記録を、同じ土俵で語れるようにしたいのだ。
          </p>`;

/** @param {string[]} paragraphs */
function speechBubbleParagraphsHtml(paragraphs) {
  return paragraphs.map((t) => `<p>${t}</p>`).join('');
}

/**
 * @param {string} avatarHtml
 * @param {string} speakerLabel
 * @param {string[]} bodyParagraphs
 * @param {boolean} reverse
 * @returns {string}
 */
function yukkuriGuideRowMultiHtml(avatarHtml, speakerLabel, bodyParagraphs, reverse) {
  const rowClass = reverse ? 'yukkuri-row yukkuri-row--reverse' : 'yukkuri-row';
  return `
          <div class="${rowClass}">
            ${avatarHtml}
            <div class="speech-bubble">
              <strong>${speakerLabel}</strong>
              ${speechBubbleParagraphsHtml(bodyParagraphs)}
            </div>
          </div>`;
}

/**
 * @param {string} avatarHtml
 * @param {string} speakerLabel
 * @param {string} body
 * @param {boolean} reverse
 * @returns {string}
 */
function yukkuriGuideRowHtml(avatarHtml, speakerLabel, body, reverse) {
  return yukkuriGuideRowMultiHtml(avatarHtml, speakerLabel, [body], reverse);
}

const LINK_PARAS = [
  '応援は、消えやすいのだ。外のプラットフォームだけだと、いいねも返信もつきにくく、自分だけ浮いているように感じて、投稿やコメントを消してしまう人もいるのだ。それは応援した人が悪いのではなく、<strong>届いたかどうかが見えにくい</strong>からなのだ。アイドルや配信の現場でも、応援投稿して反応がなくて消す、という話はよく聞くのだ。',
  'だから「<strong>応援ログ</strong>」の考え方があるのだ。ファンには「ちゃんと応援したことが、ここに残る」、主催には「ちゃんと見ているよ」を、返信の本数だけに頼らず伝えやすくするのだ。すべてに手で返すことが正解とは限らないのだ。',
  '今後 X なども視野に入れるなら、ハッシュタグやメンションなど「これをしたら記録対象」といったルールをそろえていくイメージなのだ。削除や非公開になった投稿は、プラットフォーム側の都合で追いにくいこともあるのだ。',
  '応援の<strong>可視化</strong>は、数字の競争だけではないのだ。<strong>ちゃんと応援した人が、仕組み上すくわれる</strong>方向に寄せたいのだ。'
];

const KONTA_PARAS = [
  '主催側には、「<strong>ちゃんと見てるよ</strong>」が伝わるようにしたいのだ。ログがあれば、すべてのコメントに手で返さなくても、受け取ったことが形として共有しやすいのだ。',
  '<strong>コメント</strong>や<strong>アイテム</strong>、テンションを上げてくれる行為には、一生懸命の熱量があるのだ。<strong>盛り上げてくれた人</strong>を、件数や同接の数字だけで切り捨てないでいたいのだ。',
  '同時接続（同接）の数字は、サーバー上の数だけではないのだ。<strong>同じ時間にスケジュールを合わせてきた</strong>、そのコストと意志も含めて、厚みとして語れるのだ。表示の定義はサービスごとに違うから、公式に数えるときはルールをそろえるのだ。',
  'この HTML レポートは、あとから読み返す<strong>振り返り用メモ</strong>でもあるのだ。創作者がファンの熱量に気づく手がかりになればいいのだ。'
];

const TANU_PARAS = [
  '「<strong>来場</strong>」を数えるときの原則として、<strong>応援コメントが一本はあること</strong>、という考え方を軸にしたいのだ。見ているだけの人まで同じ枠に入れないと、エンゲージした人がかえって見えにくくなるのだ。',
  '応援コメントを記録するこの拡張の設計と、「来場」や「参加」の語は、つながるのだ。<strong>動員ちゃれんじ</strong>（<a href="https://doin-challenge.com/" target="_blank" rel="noopener noreferrer">doin-challenge.com</a>）と<strong>リンクして</strong>、オンラインの応援と会場への動線を、同じ文脈で語れるようにしたいのだ。動員チャンネルなどで、定義を毎回すり替えないのが大事なのだ。',
  '熱量の階段をイメージすると、視聴・同じ時間帯にいる、デジタル上の応援（コメントやアイテム）、そして<strong>イベント当日、身体を動かしてライブ会場に来てくれたこと</strong>を、いちばん重い参加として置きたいのだ。オンラインの応援を軽くする話ではないのだ。<strong>来られない理由</strong>は人それぞれだから、別軸で尊重するのだ。',
  '全体の「ユニークユーザー」をプラットフォーム横断で正確に一つにまとめるのは難しいのだ。だから「この拡張とレポートで何を数えるか」を、文章で共有しておくのだ。'
];

const SAVE_H2 = 'なにこれ？（ゆっくりガイド）';
const SAVE_LEAD =
  'このHTMLは、このPCに保存したコメントと、当時の放送ページから取れた情報をまとめた「振り返り用メモ」なのだ。応援の痕跡を残すための記録でもあるのだ。';

/**
 * @param {string} summaryTitle summary 内のタイトル（「続きを読む」ラベルは別表示）
 * @param {string} bodyHtml
 * @returns {string}
 */
function conceptReadMoreHtml(summaryTitle, bodyHtml) {
  return `
        <details class="concept-read-more">
          <summary class="concept-read-more__summary">
            <span class="concept-read-more__tag">続きを読む</span>
            <span class="concept-read-more__title">${summaryTitle}</span>
          </summary>
          <div class="concept-read-more__body">${bodyHtml}</div>
        </details>`;
}

/**
 * @param {YukkuriReportAvatars} avatars
 * @returns {string}
 */
export function buildHtmlReportConceptGuideCardHtml(avatars) {
  const { avatarLinkHtml, avatarKontaHtml, avatarTanuHtml } = avatars;

  const linkRow = yukkuriGuideRowMultiHtml(
    avatarLinkHtml,
    'ゆっくりりんく',
    LINK_PARAS,
    false
  );
  const kontaRow = yukkuriGuideRowMultiHtml(
    avatarKontaHtml,
    'ゆっくりこん太',
    KONTA_PARAS,
    true
  );
  const tanuRow = yukkuriGuideRowMultiHtml(
    avatarTanuHtml,
    'ゆっくりたぬ姉',
    TANU_PARAS,
    false
  );

  const accordions = [
    conceptReadMoreHtml('ねらい・名前・動員ちゃれんじとの関係', CONCEPT_READ_MORE_1_BODY),
    conceptReadMoreHtml('ゆっくりりんく：応援ログと可視化', linkRow),
    conceptReadMoreHtml('ゆっくりこん太：主催の「見ている」と熱量', kontaRow),
    conceptReadMoreHtml('ゆっくりたぬ姉：来場・会場・定義の話', tanuRow)
  ].join('');

  return `
      <section class="card yukkuri-guide-card" style="margin-top:12px;">
        <h2>${CONCEPT_H2}</h2>
        <p class="guide-lead">${CONCEPT_TEASER_LEAD}</p>
        ${accordions}
      </section>`;
}

/**
 * @param {YukkuriReportAvatars} avatars
 * @returns {string}
 */
export function buildHtmlReportSaveGuideCardHtml(avatars) {
  const { avatarLinkHtml, avatarKontaHtml, avatarTanuHtml } = avatars;
  const rows = [
    yukkuriGuideRowHtml(
      avatarLinkHtml,
      'ゆっくりりんく',
      'まずは上の「概要」でタイトルと配信者を確認するのだ。検索ボックスにキーワードを入れると、このページ全体から絞り込めるのだ。',
      false
    ),
    yukkuriGuideRowHtml(
      avatarKontaHtml,
      'ゆっくりこん太',
      '「シェア・プレビュー向け」は、LINEやXでリンクを貼ったときに出やすいタイトルや説明文なのだ。細かい英語のキー名は気にしなくてよいのだ。',
      true
    ),
    yukkuriGuideRowHtml(
      avatarTanuHtml,
      'ゆっくりたぬ姉',
      'アプリ連携用の長いタグや script のURLは、下の折りたたみにまとめてあるのだ。調べものをするとき以外は開かなくて大丈夫なのだ。タグのチップは上の概要と同じだから、表では二度出さないのだ。',
      false
    )
  ];
  return `
      <section class="card yukkuri-guide-card" style="margin-top:12px;">
        <h2>${SAVE_H2}</h2>
        <p class="guide-lead">${SAVE_LEAD}</p>
        <div class="yukkuri-guide">${rows.join('')}
        </div>
      </section>`;
}
