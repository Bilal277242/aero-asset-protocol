"use client";

import * as React from "react";
import { isAddress, type Address } from "viem";
import { Check, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useContractRead } from "@/hooks/useContractRead";
import { readActingFor } from "@/lib/api/identity";

/**
 * Answers "may this address act for this organization?" — from the contract.
 *
 * **This is a lookup, not a roster.** `OrganizationRegistry` stores operators in a mapping
 * and exposes `isOperator(orgId, account)`; there is no enumerable list, and reconstructing
 * one means replaying every `OrganizationOperatorSet` event ever emitted. Showing a
 * confident-looking roster assembled from logs would be a UI claiming completeness it
 * cannot verify — if one log page were missed, an operator would silently vanish from a
 * screen people use to answer exactly this question.
 *
 * So the page asks the contract about one address at a time and reports its answer.
 *
 * The third row is the one that matters. `isActingFor` is not admin-or-operator: it *also*
 * requires the organization to be `VERIFIED`, which means a suspension silently strips
 * every operator's authority without touching a single operator record. An admin reading
 * only the first two rows would conclude their operators still work.
 */
export function ActingForCheck({ orgId }: { orgId: bigint }) {
  const [input, setInput] = React.useState("");
  const trimmed = input.trim();
  const valid = isAddress(trimmed);

  const result = useContractRead(
    ["organizations", orgId.toString(), "actingFor", trimmed.toLowerCase()],
    ({ client, book, blockNumber }) =>
      readActingFor(client, book, orgId, trimmed as Address, blockNumber),
    { enabled: valid },
  );

  const rows = result.data
    ? [
        { label: "Is the organization admin", pass: result.data.isAdmin },
        { label: "Is a registered operator", pass: result.data.isOperator },
        {
          label: "May act for this organization now",
          pass: result.data.canAct,
          note:
            !result.data.canAct && (result.data.isAdmin || result.data.isOperator)
              ? "Authority is recorded but inactive — isActingFor also requires the organization to be verified."
              : undefined,
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader
        title="Operator check"
        description="One address at a time, answered by the contract."
      />
      <CardBody>
        <Field
          label="Address"
          htmlFor="acting-for"
          hint="Nothing is stored or sent anywhere; this is a read."
          error={trimmed !== "" && !valid ? "Not a valid address." : undefined}
        >
          <Input
            id="acting-for"
            mono
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x…"
            invalid={trimmed !== "" && !valid}
          />
        </Field>

        {valid && (
          <div className="mt-3">
            {result.isLoading ? (
              <p className="text-xs text-ink-3">Reading…</p>
            ) : result.isError ? (
              <p className="text-xs text-adverse">
                {result.error?.title ?? "The check could not be completed."}
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {rows.map((r) => (
                  <li key={r.label} className="flex items-start gap-1.5 text-xs">
                    {r.pass ? (
                      <Check className="mt-0.5 size-3 shrink-0 text-confirmed" aria-hidden="true" />
                    ) : (
                      <X className="mt-0.5 size-3 shrink-0 text-ink-3" aria-hidden="true" />
                    )}
                    <span className="text-ink-2">
                      {r.label}
                      {r.note && <span className="block text-blocked">{r.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="mt-3 text-2xs leading-relaxed text-ink-3">
          Operators are stored in a mapping with no enumerable list, so the protocol can
          answer whether a given address is one but cannot produce the set. This asks the
          question rather than guessing at the answer.
        </p>
      </CardBody>
    </Card>
  );
}
