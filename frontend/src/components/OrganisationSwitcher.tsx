import { AlertCircle, Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../features/authentication/AuthProvider";
import { OrganisationSummary } from "../types/api";
import { friendlyApiMessage } from "../utilities/formErrors";

export function OrganisationSwitcher() {
  const { user, organisations, switchOrganisation } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [switchingPropertyId, setSwitchingPropertyId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);

  const currentProperty = useMemo<OrganisationSummary | null>(() => {
    if (!user) {
      return null;
    }

    return (
      organisations.find((organisation) => organisation.id === user.organisationId) ?? {
        id: user.organisationId,
        code: user.orgCode ?? "",
        name: user.orgCode ? `Property ${user.orgCode}` : "Current property",
        role: user.role
      }
    );
  }, [organisations, user]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!switcherRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  if (!user || !currentProperty) {
    return null;
  }

  const handleSwitchProperty = async (property: OrganisationSummary) => {
    if (property.id === user.organisationId) {
      setIsOpen(false);
      return;
    }

    setSwitchError(null);
    setSwitchingPropertyId(property.id);

    try {
      await switchOrganisation(property.id);
      setIsOpen(false);
    } catch (error) {
      setSwitchError(friendlyApiMessage(error, "Failed to switch property. Please try again."));
      setSwitchingPropertyId(null);
    }
  };

  if (organisations.length <= 1) {
    return (
      <div className="org-badge" style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0, fontSize: "0.85rem", opacity: 0.9 }}>
        <Building2 size={14} aria-hidden="true" />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{propertyLabel(currentProperty)}</span>
      </div>
    );
  }

  return (
    <div className="org-switcher" ref={switcherRef} style={{ position: "relative", maxWidth: "100%" }}>
      <button
        type="button"
        className="org-switcher-button"
        onClick={() => {
          setSwitchError(null);
          setIsOpen((prev) => !prev);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          maxWidth: "min(360px, calc(100vw - 2rem))",
          padding: "0.35rem 0.65rem",
          borderRadius: "0.375rem",
          border: "1px solid var(--color-border, #e5e7eb)",
          background: "var(--color-bg-surface, #ffffff)",
          cursor: "pointer",
          fontSize: "0.85rem",
          fontWeight: 500
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Switch property"
      >
        <Building2 size={15} style={{ color: "var(--color-primary, #2563eb)" }} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {propertyLabel(currentProperty)}
        </span>
        <span style={{ color: "var(--color-text-secondary, #6b7280)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>{roleLabel(currentProperty.role)}</span>
        <ChevronDown size={14} style={{ opacity: 0.7 }} />
      </button>

      {isOpen && (
        <div
          className="org-switcher-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 0.25rem)",
            right: 0,
            zIndex: 100,
            width: "min(360px, calc(100vw - 2rem))",
            background: "var(--color-bg-surface, #ffffff)",
            border: "1px solid var(--color-border, #e5e7eb)",
            borderRadius: "0.5rem",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            padding: "0.35rem 0"
          }}
          role="listbox"
        >
          <div style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary, #6b7280)", textTransform: "uppercase" }}>
            Switch Property
          </div>
          {switchError && (
            <div
              style={{
                display: "flex",
                gap: "0.4rem",
                margin: "0.25rem 0.75rem 0.35rem",
                padding: "0.45rem 0.55rem",
                borderRadius: "0.375rem",
                background: "rgba(220, 38, 38, 0.08)",
                color: "#b91c1c",
                fontSize: "0.78rem",
                lineHeight: 1.35
              }}
            >
              <AlertCircle size={15} aria-hidden="true" style={{ flex: "0 0 auto", marginTop: "0.05rem" }} />
              <span>{switchError}</span>
            </div>
          )}
          <div style={{ maxHeight: "320px", overflowY: "auto" }}>
            {organisations.map((property) => {
              const isCurrent = property.id === user.organisationId;
              const isSwitching = switchingPropertyId === property.id;
              return (
                <button
                  key={property.id}
                  type="button"
                  onClick={() => void handleSwitchProperty(property)}
                  disabled={Boolean(switchingPropertyId) || isCurrent}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "0.55rem 0.75rem",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "0.75rem",
                    alignItems: "center",
                    background: isCurrent ? "var(--color-bg-muted, #f3f4f6)" : "transparent",
                    border: "none",
                    color: "var(--color-text-primary, #111827)",
                    cursor: isCurrent || switchingPropertyId ? "default" : "pointer",
                    fontSize: "0.85rem"
                  }}
                  aria-current={isCurrent ? "true" : undefined}
                  role="option"
                  aria-selected={isCurrent}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{propertyLabel(property)}</span>
                    <span style={{ display: "block", marginTop: "0.15rem", color: "var(--color-text-secondary, #6b7280)", fontSize: "0.75rem" }}>{roleLabel(property.role)} access</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", color: "var(--color-primary, #2563eb)", fontSize: "0.75rem", fontWeight: 600 }}>
                    {isSwitching ? <Loader2 size={15} aria-label="Switching property" /> : isCurrent ? <Check size={15} aria-label="Current property" /> : "Switch"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function propertyLabel(property: Pick<OrganisationSummary, "code" | "name">) {
  return property.code ? `[${property.code}] ${property.name}` : property.name;
}

function roleLabel(role: OrganisationSummary["role"]) {
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
