import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

type StepKey = 'receive' | 'parse' | 'plan' | 'exec' | 'summary';
type StepState = 'pending' | 'done' | 'failed';

interface PipelineStep {
  key: StepKey;
  label: string;
  state: StepState;
}

interface ParsedTask {
  type: 'Email' | 'Calendar' | 'Web' | 'Other';
  title: string;
  confirm: boolean;
  detail?: string;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './evening.component.html',
  styleUrls: ['./evening.component.scss'],
})
export class EveningComponent implements OnDestroy {
  // Top pill/status
  gistId = 'MG-7Q2K9';
  faxStateLabel:
    | 'Waiting for fax'
    | 'Fax received'
    | 'Parsing'
    | 'Planned'
    | 'Executing (draft-only)'
    | 'Complete' = 'Waiting for fax';

  // Pipeline steps
  steps: PipelineStep[] = [
    { key: 'receive', label: 'Receive', state: 'pending' },
    { key: 'parse', label: 'Parse', state: 'pending' },
    { key: 'plan', label: 'Plan', state: 'pending' },
    { key: 'exec', label: 'Execute', state: 'pending' },
    { key: 'summary', label: 'Summary', state: 'pending' },
  ];

  // Parsed tasks preview
  parsedTasks: ParsedTask[] = [];
  parsedMessage = 'No fax received yet.';

  // For cleanup (avoid timers updating after you navigate away)
  private timeouts: number[] = [];

  constructor(private router: Router) {}

  ngOnDestroy(): void {
    this.clearTimers();
  }

  // ----- UI helpers -----

  getStepStatusText(step: PipelineStep): string {
    if (step.state === 'done') return 'Done';
    if (step.state === 'failed') return 'Failed';
    return 'Pending';
  }

  getStepClass(step: PipelineStep): 'ok' | 'bad' | 'warn' {
    if (step.state === 'done') return 'ok';
    if (step.state === 'failed') return 'bad';
    return 'warn';
  }

  // ----- Actions -----

  onReset(): void {
    this.clearTimers();

    this.faxStateLabel = 'Waiting for fax';
    this.steps = this.steps.map((s) => ({ ...s, state: 'pending' }));

    this.parsedTasks = [];
    this.parsedMessage = 'No fax received yet.';
  }

  onSimulateFax(): void {
    this.onReset(); // start clean

    // Stage 1: Receive
    this.faxStateLabel = 'Fax received';
    this.setStep('receive', 'done');

    // Stage 2: Parse (+ fill parsed tasks)
    this.timeouts.push(
      window.setTimeout(() => {
        this.faxStateLabel = 'Parsing';
        this.setStep('parse', 'done');

        // Demo parsed tasks (replace later with real parser output)
        this.parsedTasks = [
          {
            type: 'Email',
            title: 'Draft email to Alex: confirm dinner time + address.',
            confirm: true,
          },
          {
            type: 'Calendar',
            title: 'Hold 90-min deep work block tomorrow morning.',
            confirm: false,
          },
          {
            type: 'Web',
            title:
              'Find 3 nearby dry cleaners + hours; add best option to notes.',
            confirm: false,
          },
        ];
        this.parsedMessage = '';
      }, 700)
    );

    // Stage 3: Plan
    this.timeouts.push(
      window.setTimeout(() => {
        this.faxStateLabel = 'Planned';
        this.setStep('plan', 'done');
      }, 1400)
    );

    // Stage 4: Execute
    this.timeouts.push(
      window.setTimeout(() => {
        this.faxStateLabel = 'Executing (draft-only)';
        this.setStep('exec', 'done');
      }, 2100)
    );

    // Stage 5: Summary
    this.timeouts.push(
      window.setTimeout(() => {
        this.faxStateLabel = 'Complete';
        this.setStep('summary', 'done');
      }, 2800)
    );
  }

  onViewTomorrow(): void {
    alert(
      'Demo: tomorrow’s Morning Gist would include an execution summary (Completed / Needs review / Failed).'
    );
  }

  goToToday(): void {
    this.router.navigate(['/today']);
  }

  onPrint(): void {
    window.print();
  }

  // ----- Internal -----

  private setStep(key: StepKey, state: StepState): void {
    this.steps = this.steps.map((s) => (s.key === key ? { ...s, state } : s));
  }

  private clearTimers(): void {
    this.timeouts.forEach((t) => window.clearTimeout(t));
    this.timeouts = [];
  }
}
