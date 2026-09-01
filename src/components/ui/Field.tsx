"use client";
import { cloneElement } from "react";

// Ported from web/js/advisor.js (line ~751).
// Associates the label with its control. Caller passes htmlFor; we mirror it
// onto the child input via cloneElement so label<->input are programmatically
// linked (and clicking the label focuses the field).
export function Field(props: any) {
  const { htmlFor, label } = props;
  let child = props.children;
  if (htmlFor && child && child.props && child.props.id == null) {
    child = cloneElement(child, { id: htmlFor });
  }
  return (
    <div className="taw-field">
      <label htmlFor={htmlFor || undefined}>{label}</label>
      {child}
    </div>
  );
}
