import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { Card, Notice, PriorityBadge, fmt } from './ui.jsx';
import { PRIORITY_LEVELS } from '../lib/priority.js';
import { CHANGEOVER_SHIFTS, PINNED_MACHINES } from '../engine/scheduler.js';
import { bagsPerShift, shiftsPerWeek, weeklyCapacity } from '../engine/capacity.js';

/**
 * The reasoning behind the plan, written out in full.
 *
 * Anyone challenged on "why is this running before that?" in the Monday
 * meeting should be able to answer from this page without opening the code.
 */
export default function FaqTab({ machines, orders }) {
  const [open, setOpen] = useState(() => new Set(['what', 'algorithm']));
  const toggle = (id) => setOpen((s) => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const totalWeekly = machines.reduce((a, m) => a + weeklyCapacity(m), 0);
  const pinned = Object.entries(PINNED_MACHINES);

  return (
    <div className="space-y-5">
      <Card
        title="How this planner works"
        subtitle="What it reads, how it decides what runs first, and where your judgement overrides it."
      >
        <div className="px-5 py-4">
          <Notice tone="info">
            Everything runs in your browser. Nothing is uploaded anywhere, and the plan is stored
            only on this machine. Clearing browser data clears the plan.
          </Notice>
        </div>

        <div className="px-5 pb-5 space-y-2.5">
          <Section id="what" open={open} toggle={toggle} title="What the tool actually does">
            <P>
              You give it two files and it gives you a shift-by-shift schedule for all eight
              machines, running as many weeks forward as it takes to make every bag on the order sheet.
            </P>
            <List items={[
              <><B>Order sheet</B> (John Poole&apos;s OrderSheet, csv or xlsx) — one row per SAP code, with
                priority, weekly demand in bags, current stock and bags per carton. Columns are matched
                by name, so the sheet can be reordered without breaking the import.</>,
              <><B>Materials export</B> (Materials_Plant_9000.csv) — free stock of paper, handles, patches,
                cartons, ink and glue. This is shown on the Stock tab for reference; it does not currently
                block a run from being scheduled.</>,
              <><B>SKU master</B> (built into the tool) — for each SAP code: roll width, gsm, bags per carton,
                print colours, handle type, and the list of machines that SKU can run on.</>,
              <><B>Machine master</B> (built into the tool) — capacity per shift, efficiency, print colour
                limit, handle type, and how many shifts each machine runs per day.</>,
            ]} />
            <P>
              Net demand is what drives everything: <Code>bags to make = bags demanded − bags already in stock</Code>.
              A line with enough stock to cover the whole nine-week demand is never scheduled at all.
            </P>
          </Section>

          <Section id="algorithm" open={open} toggle={toggle} title="The algorithm, step by step">
            <P>
              It is a <B>priority-ranked greedy allocation with an expanding horizon</B>, followed by a
              changeover-minimising sequence on each machine. In plain terms: sort the work, hand it out
              to machines in that order, then tidy the running order on each machine so the shop floor
              does not change the roll every shift.
            </P>

            <Step n="1" title="Drop anything that does not need making">
              Every line where net bags required is zero or less is removed. Stock already covers it.
            </Step>

            <Step n="2" title="Rank the remaining order book">
              This is the queue, and it is the answer to &ldquo;why did that go first?&rdquo;. Four keys,
              applied in strict order — the next one is only used when the previous one ties:
              <Ranked items={[
                <><B>Priority number, lowest first.</B> A 1 always beats a 2. This is the human judgement
                  from the sheet, and you can override it on the Orders tab.</>,
                <><B>Weeks of cover, lowest first.</B> Within the same priority, whoever is closest to
                  running out goes first. Cover is <Code>stock ÷ weekly demand</Code>. This is what stops a
                  well-stocked P2 from jumping ahead of a P2 that is dry on Thursday.</>,
                <><B>Biggest job first.</B> Large runs are placed while machines still have long clear
                  stretches, so they are not chopped into fragments across five machines.</>,
                <><B>SAP code.</B> Purely so the same input always produces the same plan. Two identical
                  runs of the planner never disagree.</>,
              ]} />
            </Step>

            <Step n="3" title="Work out which machines each order may run on">
              See the machine compatibility section below. The result is an ordered shortlist, best
              machine first.
            </Step>

            <Step n="4" title="Hand the work out, in queue order">
              Each order takes as much as it can from the first machine on its shortlist, then spills the
              remainder onto the next, and so on. A machine is only asked how many free shifts it has
              left — it is never allowed to go over. Every new SKU added to a machine also costs a
              changeover shift, which is deducted from the capacity before the fit is worked out.
              Because the queue is processed in order, an urgent order gets first refusal on the good
              machines and a filler order takes what is left.
            </Step>

            <Step n="5" title="Widen the horizon until everything fits">
              The planner starts by assuming a 9-week horizon. If any bags could not be placed for lack of
              capacity, it throws that attempt away, adds two weeks and tries the whole allocation again,
              up to a limit of 52 weeks. That is why the plan tells you it needs, say, 13 weeks — that is
              the shortest horizon in which the entire order book fits.
            </Step>

            <Step n="6" title="Put each machine's work in a sensible running order">
              Allocation decides <em>what</em> each machine makes; this decides <em>in what order</em>.
              Within one machine the work is sorted by roll width, then print colours, then priority,
              then cover. Grouping by width means all the 990mm work runs before switching to 1030mm, so
              there are far fewer roll changes across the week. This is why a P1 is sometimes not
              literally the first thing on a machine on Monday morning: it has already been given the
              capacity it needs, and the running order is chosen to protect output.
            </Step>

            <Step n="7" title="Lay it onto real shifts">
              Each machine's sequence is poured into its actual working shifts, in order — Monday shift 1,
              Monday shift 2, and so on, rolling into the following week when a week is full. A shift
              holds <Code>capacity per shift × efficiency</Code> bags; the last shift of a run is a part
              shift if the remainder is small. Whenever the SKU changes, {CHANGEOVER_SHIFTS} full shift is
              inserted first and produces nothing.
            </Step>

            <Step n="8" title="Add up what it means">
              Bags, cartons, shifts used, utilisation per machine and completion per order are all counted
              back off the finished grid rather than predicted. If you hand-edit a shift, these numbers are
              recalculated from the grid the moment you save, so the headline figures always match what
              is on screen.
            </Step>
          </Section>

          <Section id="priority" open={open} toggle={toggle} title="What the priority numbers mean">
            <P>
              Priority is a plain number from 1 to 5 on the order sheet. It replaced the old
              NO&nbsp;COMPROMISE / VERY&nbsp;HIGH text tags, which were hard to sort and easy to mistype.
              Old sheets using those words still import — the words are mapped onto numbers.
            </P>
            <div className="space-y-1.5">
              {PRIORITY_LEVELS.map((p) => (
                <div key={p.value} className="flex items-start gap-3 text-sm">
                  <PriorityBadge value={p.value} />
                  <span className="text-slate-600 pt-0.5">{p.blurb}</span>
                </div>
              ))}
            </div>
            <P>
              Anything blank or unrecognised becomes a 3. Priority alone does not decide the queue —
              weeks of cover breaks ties within a priority, so urgency and stock position are both
              accounted for.
            </P>
          </Section>

          <Section id="compat" open={open} toggle={toggle} title="Machine compatibility, and why it matters">
            <P>
              A paper bag is not machine-agnostic. Handle type, print colours and bag construction all
              decide which of the eight machines can physically make it. Compatibility is what turns a
              list of orders into a plan that the factory can actually run.
            </P>
            <List items={[
              <><B>The SKU master&apos;s machine list is the authority.</B> Each SAP code carries a list of
                machines it has genuinely run on. The planner will not put an order anywhere else on its own.</>,
              <><B>Primary machine.</B> Where a SKU has a preferred machine it is tried first, then the rest
                of the list in order. This keeps products on the machine the operators know.</>,
              <><B>Primary machine only.</B> Some SKUs are locked to a single machine and never spill —
                usually tooling or a customer approval that only exists on that line.</>,
              <><B>Pinned machines.</B> A contractual reservation, held in the planner itself rather than the
                sheet. {pinned.length
                  ? pinned.map(([sap, id]) => `SAP ${sap} is pinned to ${id}`).join('; ')
                  : 'None are currently pinned'}. Pinned work is always offered its machine first. If
                demand is larger than that machine can make, the excess spills onto the SKU&apos;s other
                compatible machines and the plan says so in the notices, rather than silently dropping
                the bags or running the order past the end of the horizon.</>,
              <><B>Handle type.</B> Twisted handle and flat handle are different machines, not a setting.
                MC-6 is the only twisted-handle line in the plant.</>,
              <><B>Print colours.</B> Each machine has a ceiling. MC-4 prints 1 colour, MC-1 and MC-6 print 2,
                MC-2 prints 3, and MC-3 and MC-5 print 4. A 4-colour job cannot run on a 2-colour machine
                whatever the schedule says.</>,
              <><B>Double layer.</B> MC-5 is the only line that can make double-walled bags.</>,
              <><B>Roll width.</B> Not a compatibility limit — any machine takes any width — but it drives
                changeovers, which is why the running order groups widths together.</>,
            ]} />
            <Notice tone="warn">
              Colour and handle mismatches are reported as warnings, not used to silently drop machines.
              If the SKU master says a 4-colour bag runs on a 2-colour machine, the tool schedules it and
              tells you the data disagrees with itself. An order that quietly vanishes from the plan is a
              far worse outcome than one that is flagged.
            </Notice>
            <P>
              A SKU with no machines at all in the master cannot be planned. It appears as an error in the
              notices under the grid and is left out of the schedule entirely — that is a master data fix,
              not a planning decision.
            </P>
          </Section>

          <Section id="capacity" open={open} toggle={toggle} title="Capacity, shifts and changeovers">
            <P>
              A machine makes <Code>capacity per shift × efficiency</Code> bags in a shift, rounded down.
              Every machine now runs <B>three shifts a day, Monday to Friday</B> — fifteen shifts a week.
              The factory does not run at weekends, so there are no Saturday or Sunday slots.
            </P>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left font-medium text-slate-500 px-3 py-2">Machine</th>
                    <th className="text-left font-medium text-slate-500 px-3 py-2">Handle</th>
                    <th className="text-right font-medium text-slate-500 px-3 py-2">Colours</th>
                    <th className="text-right font-medium text-slate-500 px-3 py-2">Bags / shift</th>
                    <th className="text-right font-medium text-slate-500 px-3 py-2">Shifts / week</th>
                    <th className="text-right font-medium text-slate-500 px-3 py-2">Bags / week</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 font-medium text-slate-800">{m.id}</td>
                      <td className="px-3 py-1.5 text-slate-500">{m.handle_type}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.max_print_colors}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(bagsPerShift(m))}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{shiftsPerWeek(m)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(weeklyCapacity(m))}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                    <td className="px-3 py-1.5" colSpan={5}>Whole plant, per week</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(totalWeekly)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <P>
              A changeover costs one full shift, whatever changes — roll width, print, or just the next
              SKU. That is deliberately blunt: it is close enough for weekly planning, and it means the
              cost of fragmenting work is always visible. It is also why the changeover count on the
              summary is worth watching. Above roughly 40 for a plan, the sequence is being chopped up
              more than it should be.
            </P>
          </Section>

          <Section id="edit" open={open} toggle={toggle} title="Overriding the plan by hand">
            <P>
              The planner is a starting point. There are two places to disagree with it, and they do
              different jobs.
            </P>
            <List items={[
              <><B>Change a priority on the Orders tab.</B> Click the priority badge on any row and pick a
                new level. This changes the queue itself, so the next plan is built differently from the
                ground up — different machine choices, different sequence, possibly a different number of
                weeks. Use this when the ranking is wrong. The Planning tab will warn you that the plan on
                screen is out of date until you press Re-plan, and a Reset button puts every priority back
                to what the sheet said.</>,
              <><B>Click a shift on the Planning grid.</B> This opens the run details and lets you change
                what runs in that one shift: swap the product, change the bag count, mark it as a
                changeover, or clear it entirely. Nothing is re-planned around it — only that cell
                changes, and every total is recalculated from the grid. Use this for the things the
                order sheet cannot know: a machine down for maintenance, a customer calling on Friday, a
                trial run. Hand-edited shifts are marked with a pencil on the grid and flagged in the
                CSV export.</>,
            ]} />
            <Notice tone="warn">
              Pressing Re-plan rebuilds the schedule from scratch and discards every hand edit on the
              grid. Export the CSV first if you want to keep a copy.
            </Notice>
          </Section>

          <Section id="limits" open={open} toggle={toggle} title="What the plan does not know">
            <P>Worth being honest about, because these are the gaps you fill in the meeting.</P>
            <List items={[
              <><B>Material availability does not block a run.</B> The Stock tab flags paper reels at zero
                free stock, but the planner will still schedule a SKU that needs one. Check the zero-stock
                warning against week 1 before committing.</>,
              <><B>No delivery dates.</B> Priority and weeks of cover stand in for a due date. An order
                needed on a specific day should be raised as a priority change.</>,
              <><B>No labour or tooling constraints.</B> Every shift is assumed to be crewed.</>,
              <><B>Changeovers are flat.</B> A roll change and a plate change both cost one shift, even
                though in reality they do not.</>,
              <><B>Efficiency is a single average.</B> It does not vary by product, and it does not model
                breakdowns or ramp-up on a new SKU.</>,
              <><B>The first fit is kept.</B> This is a greedy allocation, not an optimiser. It produces a
                good, explainable plan quickly; it does not prove that no better plan exists.</>,
            ]} />
          </Section>

          <Section id="tips" open={open} toggle={toggle} title="Tips for using it well">
            <List items={[
              <>Upload the order sheet first, then the materials file. A new order sheet clears the
                existing plan on purpose, because the old plan no longer matches the demand.</>,
              <>Read the notices under the grid before anything else. Spill-over, unschedulable SKUs and
                master data conflicts are all reported there.</>,
              <>Sort the Orders tab by <B>Cover</B> to see what is closest to running out, regardless of
                what priority someone typed.</>,
              <>Watch utilisation. A machine at 100% has no room for a rush order; one below 50% is
                usually short of compatible work rather than idle by choice.</>,
              <>Use the week arrows to walk the plan forward. Week 1 is the one that matters on Monday;
                the later weeks are a capacity forecast, not a commitment.</>,
              <>Export the CSV before you re-plan. It is the only record of hand edits.</>,
              <>{orders.length
                ? `Right now there are ${orders.length} order lines loaded.`
                : 'No orders are loaded yet — start on the Import tab.'}</>,
            ]} />
          </Section>
        </div>
      </Card>
    </div>
  );
}

function Section({ id, title, open, toggle, children }) {
  const isOpen = open.has(id);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button onClick={() => toggle(id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <span className="flex items-center gap-2.5 font-medium text-slate-800">
          <HelpCircle className="w-4 h-4 text-slate-400" />{title}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">{children}</div>}
    </div>
  );
}

const P = ({ children }) => <p className="text-sm text-slate-600 leading-relaxed">{children}</p>;
const B = ({ children }) => <span className="font-semibold text-slate-800">{children}</span>;
const Code = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[12px] font-mono">{children}</code>
);

const List = ({ items }) => (
  <ul className="space-y-2">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2.5 text-sm text-slate-600 leading-relaxed">
        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const Ranked = ({ items }) => (
  <ol className="mt-2 space-y-2">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2.5 text-sm text-slate-600 leading-relaxed">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold flex items-center justify-center">
          {i + 1}
        </span>
        <span>{item}</span>
      </li>
    ))}
  </ol>
);

const Step = ({ n, title, children }) => (
  <div className="flex gap-3">
    <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-slate-800 text-white text-xs font-semibold flex items-center justify-center">
      {n}
    </span>
    <div className="flex-1">
      <div className="font-medium text-slate-800 text-sm">{title}</div>
      <div className="text-sm text-slate-600 leading-relaxed mt-1">{children}</div>
    </div>
  </div>
);
