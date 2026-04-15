"use client";

import { useState } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CaseFormInput } from "@/lib/types";

const DEBT_ORIGINS = [
  { value: "personal_loan", label: "Personal Loan" },
  { value: "telecom", label: "Telecom" },
  { value: "consumer_loan", label: "Consumer Loan" },
  { value: "credit_card", label: "Credit Card" },
  { value: "utilities", label: "Utilities" },
  { value: "other", label: "Other" },
];

const CALL_OUTCOMES = [
  { value: "not_debtor", label: "Not Debtor" },
  { value: "busy", label: "Busy" },
  { value: "rings_out", label: "Rings Out" },
  { value: "voicemail", label: "Voicemail" },
  { value: "answered_refused", label: "Answered (Refused)" },
  { value: "answered_negotiating", label: "Answered (Negotiating)" },
  { value: "wrong_number", label: "Wrong Number" },
  { value: "unknown", label: "Unknown" },
];

const LEGAL_FINDINGS = [
  { value: "no_assets_found", label: "No Assets Found" },
  { value: "assets_not_seizable", label: "Assets Not Seizable" },
  { value: "assets_found", label: "Assets Found" },
  { value: "pending", label: "Pending" },
  { value: "unknown", label: "Unknown" },
];

const COUNTRIES = [
  { value: "ES", label: "Spain" },
  { value: "PT", label: "Portugal" },
  { value: "PL", label: "Poland" },
  { value: "RO", label: "Romania" },
  { value: "IT", label: "Italy" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "GB", label: "United Kingdom" },
];

interface CaseFormProps {
  onSubmit: (input: CaseFormInput) => void;
  isDisabled: boolean;
}

export function CaseForm({ onSubmit, isDisabled }: CaseFormProps) {
  const [showAdditional, setShowAdditional] = useState(false);

  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("ES");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dniNie, setDniNie] = useState("");

  const [provincia, setProvincia] = useState("");
  const [employer, setEmployer] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");

  const [debtEur, setDebtEur] = useState("5000");
  const [debtOrigin, setDebtOrigin] = useState("personal_loan");
  const [debtAgeMonths, setDebtAgeMonths] = useState("12");
  const [callAttempts, setCallAttempts] = useState("1");
  const [callOutcome, setCallOutcome] = useState("busy");
  const [legalAssetFinding, setLegalAssetFinding] = useState("no_assets_found");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const input: CaseFormInput = {
      country,
      full_name: fullName,
      debt_eur: Number(debtEur),
      debt_origin: debtOrigin as CaseFormInput["debt_origin"],
      debt_age_months: Number(debtAgeMonths),
      call_attempts: Number(callAttempts),
      call_outcome: callOutcome as CaseFormInput["call_outcome"],
      legal_asset_finding: legalAssetFinding as CaseFormInput["legal_asset_finding"],
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(dniNie ? { dni_nie: dniNie } : {}),
      ...(provincia ? { provincia } : {}),
      ...(employer ? { employer } : {}),
      ...(city ? { city } : {}),
      ...(postalCode ? { postal_code: postalCode } : {}),
    };

    onSubmit(input);
  };

  const isValid = fullName.trim().length > 0 && Number(debtEur) > 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Subject Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Required: Subject Info */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="fullName" className="text-xs">Full Name *</Label>
              <Input
                id="fullName"
                placeholder="Juan Garcia Lopez"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isDisabled}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="country" className="text-xs">Country *</Label>
                <Select value={country} onValueChange={(v) => v && setCountry(v)} disabled={isDisabled}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="phone" className="text-xs">Phone</Label>
                <Input
                  id="phone"
                  placeholder="+34600111222"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isDisabled}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="email" className="text-xs">Email</Label>
                <Input
                  id="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isDisabled}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="dniNie" className="text-xs">DNI/NIE</Label>
                <Input
                  id="dniNie"
                  placeholder="12345678Z"
                  value={dniNie}
                  onChange={(e) => setDniNie(e.target.value)}
                  disabled={isDisabled}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Collapsible: Additional Context */}
          <button
            type="button"
            onClick={() => setShowAdditional(!showAdditional)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdditional ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Additional Context
          </button>

          {showAdditional && (
            <div className="space-y-3 pl-2 border-l-2 border-border/50">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="provincia" className="text-xs">Provincia</Label>
                  <Input
                    id="provincia"
                    placeholder="Madrid"
                    value={provincia}
                    onChange={(e) => setProvincia(e.target.value)}
                    disabled={isDisabled}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="city" className="text-xs">City</Label>
                  <Input
                    id="city"
                    placeholder="Madrid"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={isDisabled}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="employer" className="text-xs">Employer</Label>
                  <Input
                    id="employer"
                    placeholder="Telefonica S.A."
                    value={employer}
                    onChange={(e) => setEmployer(e.target.value)}
                    disabled={isDisabled}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="postalCode" className="text-xs">Postal Code</Label>
                  <Input
                    id="postalCode"
                    placeholder="28001"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    disabled={isDisabled}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Required: Debt Context */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Debt Context
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="debtEur" className="text-xs">Amount (EUR) *</Label>
                  <Input
                    id="debtEur"
                    type="number"
                    min="0"
                    value={debtEur}
                    onChange={(e) => setDebtEur(e.target.value)}
                    disabled={isDisabled}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="debtAgeMonths" className="text-xs">Age (months)</Label>
                  <Input
                    id="debtAgeMonths"
                    type="number"
                    min="0"
                    value={debtAgeMonths}
                    onChange={(e) => setDebtAgeMonths(e.target.value)}
                    disabled={isDisabled}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="debtOrigin" className="text-xs">Origin</Label>
                <Select value={debtOrigin} onValueChange={(v) => v && setDebtOrigin(v)} disabled={isDisabled}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEBT_ORIGINS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="callAttempts" className="text-xs">Call Attempts</Label>
                  <Input
                    id="callAttempts"
                    type="number"
                    min="0"
                    value={callAttempts}
                    onChange={(e) => setCallAttempts(e.target.value)}
                    disabled={isDisabled}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="callOutcome" className="text-xs">Call Outcome</Label>
                  <Select value={callOutcome} onValueChange={(v) => v && setCallOutcome(v)} disabled={isDisabled}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CALL_OUTCOMES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="legalAssetFinding" className="text-xs">Legal / Asset Finding</Label>
                <Select value={legalAssetFinding} onValueChange={(v) => v && setLegalAssetFinding(v)} disabled={isDisabled}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_FINDINGS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isDisabled || !isValid}
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Search className="h-4 w-4" />
            {isDisabled ? "Investigating..." : "Investigate"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
