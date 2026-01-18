import { useState, useRef, useEffect } from 'react';

interface DropdownOption<T> {
  value: T;
  label: string;
  color?: string;
  bg?: string;
}

interface DropdownProps<T> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
}

export function Dropdown<T extends string | number>({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#f8f6f4] rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 transition-all hover:bg-[#f3f0ed]"
      >
        {selectedOption ? (
          <span className="flex items-center gap-2">
            {selectedOption.color && (
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: selectedOption.color }}
              />
            )}
            <span className="text-[#1a1a1a]">{selectedOption.label}</span>
          </span>
        ) : (
          <span className="text-[#b5b0aa]">{placeholder}</span>
        )}
        <svg
          className={`w-4 h-4 text-[#8a857f] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-xl border border-[#e8e4df] shadow-lg shadow-black/5 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2.5 text-sm text-left flex items-center gap-2 transition-all ${
                option.value === value
                  ? 'bg-[#f0ebe5]'
                  : 'hover:bg-[#f8f6f4]'
              }`}
            >
              {option.color && (
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
              )}
              <span className="text-[#1a1a1a]">{option.label}</span>
              {option.value === value && (
                <svg className="w-4 h-4 text-[#d4a574] ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface PriorityDropdownProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

export function PriorityDropdown({ value, onChange, className = '' }: PriorityDropdownProps) {
  const options = [
    { value: 0, label: 'Low', color: '#8a857f' },
    { value: 1, label: 'Medium', color: '#d4a574' },
    { value: 2, label: 'High', color: '#c45c4a' },
  ];

  return (
    <Dropdown
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Priority"
      className={className}
    />
  );
}
