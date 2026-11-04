import * as React from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** ui controls at the admin's sizes: 36 px fields, 44 px with 16 px text on coarse pointers. */
const FIELD_SIZE = "h-9 py-0 pointer-coarse:h-11 pointer-coarse:text-base";

/** A text field of the venue screens. */
export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return <Input ref={ref} className={cn(FIELD_SIZE, className)} {...props} />;
});

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...props }, ref) {
  return <Textarea ref={ref} className={cn("pointer-coarse:text-base", className)} {...props} />;
});

/** A 36 px select in a form. */
export const FieldSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function FieldSelect({ className, ...props }, ref) {
  return <Select ref={ref} className={cn(FIELD_SIZE, "px-2", className)} {...props} />;
});

/** The 30 px select used inside rows and tables. */
export const RowSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function RowSelect({ className, ...props }, ref) {
  return <Select ref={ref} className={cn("h-[30px] w-auto max-w-full px-2 py-0 pointer-coarse:h-11 pointer-coarse:text-base", className)} {...props} />;
});

/** A text link in lilac, as every admin link. */
export const LINK = "rounded-sm text-lilac underline-offset-4 hover:underline";
