# このフォークの方針

eeharumt のフォークで、アプリをどう作り、自分の好みをどう入れるかの決まりです。
2026年11月27日に決めました。このフォークで作業するエージェントは、これに従います。

## 使うアプリ

| 端末 | 使うアプリ | 置き場所 |
|---|---|---|
| Windows | フォーク元のデスクトップアプリ（GPUI 版） | `desktop/` |
| Android | フォーク元の Android アプリ | `android-native/` |
| ブラウザ | フォーク元のウェブサイト | `web/` |

フォーク元にあるアプリを使い、自分で別のアプリは作りません。

Tauri で Windows と Android を一つにまとめた版は、2026年11月27日に開発を止めました。
コードは `archive/tauri-client` ブランチ（`fd59240d`）に残してあり、`main` からは外しました。

## 理由

- フォーク元は、デスクトップアプリと Android アプリをほぼ毎日更新します。自分の変更は、それよりずっと少なく、たまにしか入りません。
  フォーク元の更新をそのまま取り込める形のほうが、手間が少なく済みます。
- 別に作ったアプリは、フォーク元の新しい機能を毎回手で移すことになります。
  Tauri 版は止めた時点で、スラッシュコマンド、Schedules、通知、QR の読み取りがまだありませんでした。
- デスクトップアプリとスマホは、受け持つ仕事が違います。デスクトップアプリはランナーにつながり、ターミナル、ローカルのファイル、Canvas を扱えます。
  スマホとウェブサイトは Convex だけを見ます。同じ画面を両方に出すと、デスクトップ側の機能が抜けます。

## 好みの入れ方

上から順に試します。

1. **コードを変えずに済ませる。** 設定（runner.json など）や、`.threadbear/patches/` のパッチ（ボタンやパネルを足す仕組み）で足りるかを見ます。
   これならフォーク元の更新とぶつかりません。
2. **誰にでも役立つ変更は、フォーク元に提案する。** 取り込まれれば、このフォークで持ち続けなくて済みます。
   提案は、ユーザーが送ると決めたときだけ送ります。
3. **それ以外は、アプリごとに小さく直す。** デスクトップアプリと Android アプリの両方に要るなら、両方に入れます。
   変更は一つのコミットにまとめ、下の一覧に足します。

## このフォークだけの変更

フォーク元の新しい版を取り込むときは、これらが残っているかを確かめます。

| 変更 | 場所 | コミット |
|---|---|---|
| Windows で Cursor の ACP を使う。OpenCode の設定は希望したときだけ読む | `runner/` | `5e4a0dee` |
| ウェブサイトのモデル選択と、スラッシュコマンドの返事の表示 | `web/` | `cb5a98ea` |
| ウェブサイトのページで、effect による状態のリセットをやめる | `web/` | `3ee2f66c` |
| ウェブサイトのスレッド作成で、エージェントとモデルを分けて選ぶ | `web/` | `98c2ed3c`、`f63e8c88` |
| フォーク版の Android アプリを、ストア版と並べて入れる | `android-native/` | `f3ba1f68` |
| Android のスレッド作成で、エージェントとモデルを分けて選ぶ | `android-native/` | `6dc42ccb` |
| Android の返信欄の上に、定型文のボタンを出す | `android-native/` | `5255b795` |
| Android の Schedules 画面 | `android-native/` | `358502ef` |
| フォーク版の Android アプリのアイコンを青緑にする | `android-native/` | `697278fc` |
| Windows で `tb land` を動かす | `runner/` | `144032ea`、`aba788f6` |
| Windows の `check.sh` で、Windows で落ちると分かっているテストを外す（`tb land` が1時間超から数分に） | `check.sh`、`runner/test/unit/win-acl.test.ts` | `6f2a558d` |
| Windows の `check.sh` で、デスクトップのチェックを cargo で直接動かし、Windows のコードに lint をかけない（フォーク元も Windows は lint の対象外） | `check.sh` | 「Run the desktop checks on Windows」 |
| Windows のデスクトップアプリにシステムのタイトルバーを出す。パネルのバーをドラッグしたときもウィンドウが動く | `desktop/dock/src/platform.rs`、`desktop/gpui/` | 「Show the system title bar on the Windows desktop app」 |
| CLI の更新に失敗したときのバナーで、色の制御コードや記号を外して理由の行を出す。Dismiss したことを起動し直しても覚えておく | `runner/src/updates/manager.ts`、`desktop/gpui/` | 「Say why a CLI update failed in plain text, and keep its banner dismissed」 |
| mise で入れた OpenCode は、Update を押すと `mise upgrade opencode` で更新する（OpenCode 自身の更新は入れ方がわからずに失敗する） | `runner/src/adapters/acp/agents.ts`、`runner/src/updates/manager.ts` | 「Update OpenCode through mise when mise installed it」 |

## Windows で作業するとき

- **改行コード:** このリポジトリでは `git config core.autocrlf false` にしてある。Git for Windows は既定で改行を CRLF にして取り出すが、このリポジトリのツールは LF を前提にしている（ウェブサイトのビルドが止まった、2026年11月27日）。新しく clone したら、同じ設定をしてから取り出し直す。
- **偽の `.git` フォルダ:** Cursor が、ホームフォルダや `AppData\Local` に検索の索引だけを入れた `.git` を作ることがある。あると、ランナーがその下のフォルダを git のリポジトリと思い込み、テストが落ちる。見つけたら脇へ移す。
- **デスクトップアプリ:** `desktop/` で `cargo build --release -p threadbear-gpui` を走らせ、`threadbear-gpui.exe` と `threadbear-web-helper.exe` を `\192.168.11.22\ssd\software\threadbear-windows\` に置く。各 PC では、そこにある `install.cmd` を実行すると入る。フォーク元の自動更新は Mac だけなので、Windows は自分で更新する。
  - **更新ボタン:** DESKTOP-01 の Threadbear では、`C:\Users\mossa\Projects` のスレッドのメッセージ欄の上に「Windows アプリを更新」ボタンがある。押すと、GitHub の main からビルドして NAS に置き、`install.cmd /quiet` でアプリを入れ替えて開き直す（ビルド済みのものがあれば十数秒、初回は数分）。ボタンは `C:\Users\mossa\Projects\.threadbear\patches\windows-app.ts`、中身は `~/.threadbear/windows-app-update.sh`、経過は `%LOCALAPPDATA%\Threadbear\Logs\windows-app-update.log` に出る。どれもリポジトリの外にある。パッチを `~/.threadbear/patches` に置かないのは、Windows では一時フォルダがホームの下にあり、ランナーのテストがそのパッチを拾って落ちるから。
  - **ほかの PC（GEN-WS）:** ボタンで更新したあと、NAS の `install.cmd` を実行すると同じ版になる。NAS の `version.txt` に、いま置いてある版のコミットが書いてある。
- **Android アプリ:** `android-native/` で、JDK 17（mise の temurin）と Android SDK を使って `./gradlew.bat --no-daemon :app:assembleFdroidRelease -PthreadbearFork=eeharu -PthreadbearRelease=<日付>` を走らせる。`~/.config/threadbear-android/release.jks` の鍵で署名されるので、入っている版に上書きできる。通知はスマホの ntfy（UnifiedPush）経由で届く。
- **スマホのペアリング:** メインのランナーは GEN-WS にあり、QR はそこでしか出せない。
