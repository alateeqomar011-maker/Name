import { Bot, Check, HardDrive, KeyRound, Lock, MessageSquareWarning, RotateCcw, ScanSearch, ShieldCheck, Sprout, X } from 'lucide-react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';

const PROMISES = [
  { icon: KeyRound, title: 'We never ask for passwords', body: 'There is no password field anywhere in FollowBoost, and there never will be.' },
  { icon: Lock, title: 'No login or 2FA codes', body: "We'll never ask for a verification code, backup code or a login link." },
  { icon: ScanSearch, title: 'Public username only', body: 'We only check that the username is formatted correctly. We never log in, look up or change any account.' },
  { icon: Bot, title: 'Simulations are labeled', body: 'Demo results are simulated and say so on every screen. No followers are ever added.' },
  { icon: HardDrive, title: 'Your history stays local', body: 'Requests are stored in this browser only. Clear them any time below.' },
];

const COMPARE: { label: string; demo: string | boolean; growth: string | boolean }[] = [
  { label: 'What you get', demo: 'A simulated run and sample report', growth: 'A personalized growth plan' },
  { label: 'Adds followers to your account', demo: false, growth: false },
  { label: 'Followers are real people', demo: false, growth: true },
  { label: 'Time to result', demo: '6–15 seconds', growth: 'Weeks to months of posting' },
  { label: 'Safe for your account', demo: true, growth: true },
];

const FAQ = [
  {
    q: 'Does demo mode add followers to my account?',
    a: "No. Demo mode runs entirely in your browser. It simulates what a bot-follower order would look like and labels every result as simulated. Nothing is sent to any social platform.",
  },
  {
    q: 'Can I buy real followers here?',
    a: "No. Bought followers are bots or inactive accounts, and buying them breaks the rules of every major platform. Real growth mode gives you a plan to earn genuine followers instead.",
  },
  {
    q: 'Why did my request fail?',
    a: "Requests fail when the handle is reserved or owned by a platform (for example @instagram or @admin). Usernames are also checked for each platform's format before you can submit.",
  },
  {
    q: 'Do you check that my account exists?',
    a: "No. FollowBoost doesn't connect to any platform, so it can't see your account. Any correctly formatted public username works.",
  },
  {
    q: 'Where is my data stored?',
    a: "In your browser's local storage on this device. We don't run a server that receives your usernames. Reset demo data below to remove everything.",
  },
  {
    q: 'Someone claiming to be FollowBoost asked for my password. What do I do?',
    a: "Don't share it. FollowBoost never asks for passwords or codes, so anyone who does is trying to take over your account. Report the message to the platform and turn on two-factor authentication.",
  },
  {
    q: 'How accurate are the growth timelines?',
    a: 'They are estimates for a creator posting consistently with average results. Niche, content quality and timing all move the numbers, so use them as a guide, not a promise.',
  },
];

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === 'string') return <>{value}</>;
  return value ? (
    <span className="yes">
      <Check size={16} aria-hidden /> Yes
    </span>
  ) : (
    <span className="no">
      <X size={16} aria-hidden /> No
    </span>
  );
}

export function HelpView() {
  const { reset, requests } = useStore();
  const ui = useUI();

  const resetAll = async () => {
    const ok = await ui.confirm({
      title: 'Reset all demo data?',
      body: `This deletes all ${requests.length} request${requests.length === 1 ? '' : 's'}, cancels anything running and clears your saved form. This can't be undone.`,
      confirmLabel: 'Reset everything',
      danger: true,
    });
    if (!ok) return;
    reset();
    ui.toast({ tone: 'success', title: 'Demo data reset', body: 'Your history and saved settings were cleared.' });
  };

  return (
    <div className="view help">
      <header className="page-head">
        <span className="eyebrow">
          <ShieldCheck size={14} aria-hidden /> Trust & safety
        </span>
        <h1>Safety & help</h1>
        <p className="lede">How FollowBoost works, what demo mode is (and isn't), and how we keep your accounts safe.</p>
      </header>

      <section className="card pad" aria-labelledby="promises-title">
        <h2 id="promises-title" className="card-title">
          Our safety promises
        </h2>
        <ul className="promises">
          {PROMISES.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <span className="promise-icon">
                <Icon size={18} aria-hidden />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{body}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="two-col">
        <section className="card pad" aria-labelledby="how-title">
          <h2 id="how-title" className="card-title">
            How it works
          </h2>
          <ol className="how">
            <li>
              <strong>Pick a goal</strong>
              <small>Choose 1,000, 5,000, 10,000 or 100,000 followers and your platform.</small>
            </li>
            <li>
              <strong>Enter a public username</strong>
              <small>We check the format for that platform. No login needed.</small>
            </li>
            <li>
              <strong>Choose demo or real growth</strong>
              <small>Watch a labeled simulation, or get a plan to grow for real.</small>
            </li>
            <li>
              <strong>Track it on the dashboard</strong>
              <small>Follow live progress, open reports and revisit your history.</small>
            </li>
          </ol>
        </section>

        <section className="card pad" aria-labelledby="compare-title">
          <h2 id="compare-title" className="card-title">
            Demo mode vs real growth
          </h2>
          <div className="table-scroll">
            <table className="table compare">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col">
                    <span className="th-icon">
                      <Bot size={14} aria-hidden /> Demo
                    </span>
                  </th>
                  <th scope="col">
                    <span className="th-icon">
                      <Sprout size={14} aria-hidden /> Real growth
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>
                      <Cell value={row.demo} />
                    </td>
                    <td>
                      <Cell value={row.growth} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card pad" aria-labelledby="faq-title">
        <h2 id="faq-title" className="card-title">
          Frequently asked questions
        </h2>
        <div className="faq">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="card pad danger-zone" aria-labelledby="reset-title">
        <div>
          <h2 id="reset-title" className="card-title">
            <MessageSquareWarning size={18} aria-hidden /> Reset demo data
          </h2>
          <p>Delete every request and saved setting stored in this browser.</p>
        </div>
        <button type="button" className="btn btn-danger" onClick={() => void resetAll()}>
          <RotateCcw size={16} aria-hidden /> Reset demo data
        </button>
      </section>
    </div>
  );
}
