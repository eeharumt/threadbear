import { Component, StrictMode, useMemo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ConvexError } from 'convex/values';
import { InboxProvider } from '../../../web/src/inbox';
import { LinkConfirm } from '../../../web/src/link-confirm';
import { go, threadPath, useRoute } from '../../../web/src/route';
import { InboxScreen } from './inbox-screen';
import { openOutside } from './links';
import { PairScreen } from './pair-screen';
import { Empty, IconButton } from './parts';
import { unpair, useSession, type Session } from './session';
import { ThreadScreen } from './thread-screen';
import logo from '../../../android-native/app/src/main/res/drawable-nodpi/ic_launcher_fg.png';
import './styles.css';

openOutside();

// Pages are the website's addresses (/ and /t/<id>, route.ts), so a thread
// link in a message opens here as it does there, and Android's back gesture,
// which goes back in the WebView's history, leaves a thread for the list.
const back = () => (history.length > 1 ? history.back() : go('/'));

/**
 * The list and the open thread side by side in a wide window (Windows, a
 * tablet), or one at a time on a phone, as the Android app. The list stays
 * mounted under a thread, so coming back finds it where it was.
 */
function Paired({ session }: { session: Session }) {
  const client = useMemo(() => new ConvexReactClient(session.url), [session.url]);
  const route = useRoute();
  const threadId = route.page === 'thread' ? route.threadId : undefined;
  return (
    <ConvexProvider client={client}>
      <Catch>
        <InboxProvider token={session.token}>
          <div className={`panes ${threadId ? 'has-thread' : ''}`}>
            <section className="pane-list">
              <InboxScreen token={session.token} open={(id) => go(threadPath(id))} selected={threadId} />
            </section>
            <section className="pane-thread">
              {threadId ? (
                <Catch key={threadId}>
                  <ThreadScreen token={session.token} threadId={threadId} back={back} />
                </Catch>
              ) : (
                <div className="pick">
                  <img src={logo} alt="" />
                  <span>Pick a thread.</span>
                </div>
              )}
            </section>
          </div>
        </InboxProvider>
      </Catch>
      <LinkConfirm />
    </ConvexProvider>
  );
}

// What Convex throws instead of a blank screen: a pairing that's been
// revoked, a thread that's gone, anything else said as it is.
class Catch extends Component<{ children: ReactNode }, { error: unknown }> {
  override state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const kind = error instanceof ConvexError ? (error.data as { kind?: string })?.kind : undefined;
    if (kind === 'auth') {
      return (
        <div className="screen centred">
          <Empty icon="cloudOff" title="This device isn't paired any more" text="Its pairing was revoked or ran out. Pair again with a new code from your Mac." />
          <button className="outlined-button" onClick={unpair}>
            Pair again
          </button>
        </div>
      );
    }
    return (
      <div className="screen">
        <header className="top-bar">
          <IconButton name="back" label="Back" className="back-button" onClick={() => (this.setState({ error: null }), back())} />
        </header>
        <div className="screen centred">
          {kind === 'notFound' ? <Empty icon="inbox" title="This thread's gone" text="It may have been deleted on the Mac." /> : <Empty icon="alert" title="Something went wrong" text={String(error)} />}
        </div>
      </div>
    );
  }
}

function App() {
  const session = useSession();
  return session ? <Paired key={session.url + session.token} session={session} /> : <PairScreen />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
