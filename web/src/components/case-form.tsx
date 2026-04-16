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

const filled = (value: string) => value.trim() ? "bg-[#EDE8D0]/60" : "";
const labelClass = "text-sm text-foreground/70";

interface CaseFormProps {
  onSubmit: (input: CaseFormInput) => void;
  isDisabled: boolean;
}

export function CaseForm({ onSubmit, isDisabled }: CaseFormProps) {
  const [showAdditional, setShowAdditional] = useState(false);
  const [showDebt, setShowDebt] = useState(false);

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
    <Card className="bg-transparent border-none shadow-none ring-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-foreground/50 uppercase tracking-wider">
          Subject Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Required: Subject Info */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="fullName" className={labelClass}>Full Name *</Label>
              <Input
                id="fullName"
                placeholder="Juan Garcia Lopez"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isDisabled}
                className={`mt-1 ${filled(fullName)}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="country" className={labelClass}>Country *</Label>
                <Select value={country} onValueChange={(v) => v && setCountry(v)} disabled={isDisabled}>
                  <SelectTrigger className={`mt-1 ${country ? "bg-[#EDE8D0]/60" : ""}`}>
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
                <Label htmlFor="phone" className={labelClass}>Phone</Label>
                <Input
                  id="phone"
                  placeholder="+34600111222"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isDisabled}
                  className={`mt-1 ${filled(phone)}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="email" className={labelClass}>Email</Label>
                <Input
                  id="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isDisabled}
                  className={`mt-1 ${filled(email)}`}
                />
              </div>
              <div>
                <Label htmlFor="dniNie" className={labelClass}>DNI/NIE</Label>
                <Input
                  id="dniNie"
                  placeholder="12345678Z"
                  value={dniNie}
                  onChange={(e) => setDniNie(e.target.value)}
                  disabled={isDisabled}
                  className={`mt-1 ${filled(dniNie)}`}
                />
              </div>
            </div>
          </div>

          {/* Collapsible: Additional Context */}
          <button
            type="button"
            onClick={() => setShowAdditional(!showAdditional)}
            className="flex items-center gap-1.5 text-sm text-foreground/50 hover:text-foreground transition-colors"
          >
            {showAdditional ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Additional Context
          </button>

          {showAdditional && (
            <div className="space-y-3 pl-2 border-l-2 border-foreground/10">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="provincia" className={labelClass}>Provincia</Label>
                  <Input
                    id="provincia"
                    placeholder="Madrid"
                    value={provincia}
                    onChange={(e) => setProvincia(e.target.value)}
                    disabled={isDisabled}
                    className={`mt-1 ${filled(provincia)}`}
                  />
                </div>
                <div>
                  <Label htmlFor="city" className={labelClass}>City</Label>
                  <Input
                    id="city"
                    placeholder="Madrid"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={isDisabled}
                    className={`mt-1 ${filled(city)}`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="employer" className={labelClass}>Employer</Label>
                  <Input
                    id="employer"
                    placeholder="Telefonica S.A."
                    value={employer}
                    onChange={(e) => setEmployer(e.target.value)}
                    disabled={isDisabled}
                    className={`mt-1 ${filled(employer)}`}
                  />
                </div>
                <div>
                  <Label htmlFor="postalCode" className={labelClass}>Postal Code</Label>
                  <Input
                    id="postalCode"
                    placeholder="28001"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    disabled={isDisabled}
                    className={`mt-1 ${filled(postalCode)}`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Collapsible: Debt Context */}
          <button
            type="button"
            onClick={() => setShowDebt(!showDebt)}
            className="flex items-center gap-1.5 text-sm text-foreground/50 hover:text-foreground transition-colors"
          >
            {showDebt ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Debt Context
          </button>

          {showDebt && (
            <div className="space-y-3 pl-2 border-l-2 border-foreground/10">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="debtEur" className={labelClass}>Amount (EUR) *</Label>
                  <Input
                    id="debtEur"
                    type="number"
                    min="0"
                    value={debtEur}
                    onChange={(e) => setDebtEur(e.target.value)}
                    disabled={isDisabled}
                    className={`mt-1 ${filled(debtEur)}`}
                  />
                </div>
                <div>
                  <Label htmlFor="debtAgeMonths" className={labelClass}>Age (months)</Label>
                  <Input
                    id="debtAgeMonths"
                    type="number"
                    min="0"
                    value={debtAgeMonths}
                    onChange={(e) => setDebtAgeMonths(e.target.value)}
                    disabled={isDisabled}
                    className={`mt-1 ${filled(debtAgeMonths)}`}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="debtOrigin" className={labelClass}>Origin</Label>
                <Select value={debtOrigin} onValueChange={(v) => v && setDebtOrigin(v)} disabled={isDisabled}>
                  <SelectTrigger className={`mt-1 ${debtOrigin ? "bg-[#EDE8D0]/60" : ""}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEBT_ORIGINS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="callAttempts" className={labelClass}>Call Attempts</Label>
                  <Input
                    id="callAttempts"
                    type="number"
                    min="0"
                    value={callAttempts}
                    onChange={(e) => setCallAttempts(e.target.value)}
                    disabled={isDisabled}
                    className={`mt-1 ${filled(callAttempts)}`}
                  />
                </div>
                <div>
                  <Label htmlFor="callOutcome" className={labelClass}>Call Outcome</Label>
                  <Select value={callOutcome} onValueChange={(v) => v && setCallOutcome(v)} disabled={isDisabled}>
                    <SelectTrigger className={`mt-1 ${callOutcome ? "bg-[#EDE8D0]/60" : ""}`}>
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
                <Label htmlFor="legalAssetFinding" className={labelClass}>Legal / Asset Finding</Label>
                <Select value={legalAssetFinding} onValueChange={(v) => v && setLegalAssetFinding(v)} disabled={isDisabled}>
                  <SelectTrigger className={`mt-1 ${legalAssetFinding ? "bg-[#EDE8D0]/60" : ""}`}>
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
          )}

          <Button
            type="submit"
            size="lg"
            disabled={isDisabled || !isValid}
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Search className="h-5 w-5" />
            {isDisabled ? "Investigating..." : "Investigate"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
