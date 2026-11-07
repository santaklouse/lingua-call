import { useState } from 'react';
import {
  Button,
  Card,
  IconButton,
  Modal,
  ScreenShell,
  SegmentedControl,
  Spinner,
  StatusPill,
  Switch,
  TextField,
  TokenField,
} from '../ui';

/** Development-only gallery of base UI components (open with #kit). */
export function KitDemo() {
  const [switchOn, setSwitchOn] = useState(true);
  const [mode, setMode] = useState<'off' | 'quiet' | 'full'>('quiet');
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <ScreenShell
      title="UI kit"
      subtitle="Base components, tokens and states"
      footer={<Button fullWidth>Primary action</Button>}
    >
      <Card>
        <h2>Buttons</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Card>

      <Card>
        <h2>Status</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <StatusPill tone="neutral">Idle</StatusPill>
          <StatusPill tone="success">Connected</StatusPill>
          <StatusPill tone="warning">Reconnecting</StatusPill>
          <StatusPill tone="danger">Error</StatusPill>
          <Spinner label="Loading" />
          <Spinner size="lg" label="Loading" />
        </div>
      </Card>

      <Card>
        <h2>Inputs</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          <TextField label="Native language" placeholder="ru" />
          <TextField label="Token" hint="Starts with pnc1_" error="Token is invalid" />
          <TokenField
            label="Invite token"
            value="pnc1_example-token-value"
            copyLabel="Copy"
            copiedLabel="Copied"
            hint="Share it with the other participant"
          />
        </div>
      </Card>

      <Card>
        <h2>Controls</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          <Switch
            checked={switchOn}
            onChange={setSwitchOn}
            label="Dubbing"
            description="Hear the translation out loud"
          />
          <SegmentedControl
            label="Original audio"
            value={mode}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'quiet', label: 'Quiet' },
              { value: 'full', label: 'Full' },
            ]}
            onChange={setMode}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <IconButton label="Mute">🎙</IconButton>
            <IconButton label="Camera off">📷</IconButton>
            <IconButton label="Hang up" danger>
              ✕
            </IconButton>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        title="Subtitles settings"
        closeLabel="Close"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              Save
            </Button>
          </>
        }
      >
        <p>Modal content goes here.</p>
      </Modal>
    </ScreenShell>
  );
}
