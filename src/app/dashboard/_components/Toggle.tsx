"use client";

interface ToggleProps {
 enabled: boolean;
 onChange: () => void;
 ariaLabel?: string;
}

export default function Toggle({ enabled, onChange, ariaLabel }: ToggleProps) {
 return (
 <button
 type="button"
 role="switch"
 aria-checked={enabled}
 aria-label={ariaLabel}
 onClick={onChange}
 className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
 enabled ?"bg-amber-600" :"bg-gray-200"
 }`}
 >
 <span
 className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
 enabled ?"translate-x-5" :"translate-x-0"
 }`}
 />
 </button>
 );
}
