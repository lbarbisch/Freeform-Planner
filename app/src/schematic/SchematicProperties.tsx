import { useEffect, useRef } from 'react';
import { instanceSymbol, mirrorInstance, ownerOf, partInstances, setRef, setRotation, setValue, symbolOf, unitCount, unitName, unitOf, type Netlist, type Rotation } from '../core';
import { apply, endGesture, select, useApp } from '../app/store';
import { TextField } from '../app/fields';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export function SchematicProperties({ netlist, focusRef, onRenameLabel }: { netlist: Netlist; focusRef: number; onRenameLabel: (id: string) => void }) {
  const project = useApp((s) => s.history.present);
  const selection = useApp((s) => s.selection);
  const refInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusRef > 0) {
      refInput.current?.focus();
      refInput.current?.select();
    }
  }, [focusRef]);

  const count = selection.instances.length + selection.wires.length + selection.labels.length;
  let body: React.ReactNode = <p className="muted">Select a part to edit it. Pick parts from the list on the left.</p>;

  if (selection.instances.length === 1 && count === 1) {
    const inst = project.schematic.instances[selection.instances[0]!];
    const part = inst && project.library.parts[inst.partId];
    if (inst && part) {
      const isPower = project.library.symbols[part.symbolId]?.power;
      const symbol = symbolOf(project, inst);
      const units = symbol ? unitCount(symbol) : 1;
      const owner = ownerOf(inst);
      body = (
        <div className="props" data-testid="instance-props">
          <h3>{part.name}</h3>
          {part.description && <p className="muted">{part.description}</p>}
          {units > 1 && (
            <p className="muted" data-testid="prop-unit">
              Subpart {unitName(unitOf(inst))} of {units}. Reference and value belong to the whole part; deleting one subpart deletes all of them.
            </p>
          )}
          {!isPower && <TextField label="Reference" value={inst.ref} inputRef={refInput} testId="prop-ref" onCommit={(v) => apply((p) => setRef(p, inst.id, v))} />}
          <TextField label={isPower ? 'Net name' : 'Value'} value={inst.value} testId="prop-value" onCommit={(v) => apply((p) => setValue(p, inst.id, v))} />
          <label className="field">
            <span>Rotation</span>
            <select value={inst.rotation} onChange={(e) => apply((p) => setRotation(p, inst.id, Number(e.target.value) as Rotation))} data-testid="prop-rotation">
              {ROTATIONS.map((r) => (
                <option key={r} value={r}>
                  {r}°
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button onClick={() => apply((p) => mirrorInstance(p, inst.id))}>Mirror</button>
          </div>
          {!isPower && (
            <>
              <h4>Pins</h4>
              <table className="mini">
                <tbody>
                  {(instanceSymbol(project, inst)?.pins ?? []).map((pin) => (
                    <tr key={pin.number}>
                      <td>{pin.number}</td>
                      <td>{pin.name}</td>
                      <td>{netlist.nets[netlist.netOfPin.get(`${owner}:${pin.number}`) ?? -1]?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      );
    }
  } else if (selection.labels.length === 1 && count === 1) {
    const label = project.schematic.labels[selection.labels[0]!];
    if (label)
      body = (
        <div className="props">
          <h3>Net label</h3>
          <p>{label.name}</p>
          <button onClick={() => onRenameLabel(label.id)}>Rename…</button>
        </div>
      );
  } else if (count > 0) {
    body = (
      <p>
        {selection.instances.length} parts, {selection.wires.length} wires, {selection.labels.length} labels selected
      </p>
    );
  }

  return (
    <aside className="side-panel properties" onBlur={() => endGesture()}>
      {body}
      <details open className="netlist" data-testid="netlist">
        <summary>Nets ({netlist.nets.length})</summary>
        <ul>
          {netlist.nets.map((net) => (
            <li key={net.name} data-net={net.name}>
              <button
                className="link"
                title="Select the parts of this net"
                onClick={() => select({ instances: [...new Set(net.nodes.flatMap((n) => partInstances(project, n.instanceId)))] })}
              >
                <strong>{net.name}</strong>
              </button>{' '}
              <span className="muted">{net.nodes.map((n) => `${project.schematic.instances[n.instanceId]?.ref}.${n.pin}`).join(' ')}</span>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}
