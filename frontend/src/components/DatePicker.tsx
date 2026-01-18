import { useState, useRef, useEffect } from 'react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({ value, onChange, placeholder = 'Select date', className = '' }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      return new Date(value);
    }
    return new Date();
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? new Date(value) : null;

  const handleToggle = () => {
    if (!isOpen && containerRef.current) {
      // Calculate position BEFORE opening
      const rect = containerRef.current.getBoundingClientRect();
      const calendarHeight = 340;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setFlipUp(spaceBelow < calendarHeight && spaceAbove > calendarHeight);
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const selectDate = (day: number) => {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    // Format as YYYY-MM-DD
    const formatted = date.toISOString().split('T')[0];
    onChange(formatted);
    setIsOpen(false);
  };

  const clearDate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() &&
           viewDate.getMonth() === today.getMonth() &&
           viewDate.getFullYear() === today.getFullYear();
  };

  const isSelected = (day: number) => {
    if (!selectedDate) return false;
    return day === selectedDate.getDate() &&
           viewDate.getMonth() === selectedDate.getMonth() &&
           viewDate.getFullYear() === selectedDate.getFullYear();
  };

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Generate calendar grid
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        className="w-full bg-[#f8f6f4] rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 transition-all hover:bg-[#f3f0ed]"
      >
        {value ? (
          <span className="text-[#1a1a1a]">{formatDisplayDate(value)}</span>
        ) : (
          <span className="text-[#b5b0aa]">{placeholder}</span>
        )}
        <div className="flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={clearDate}
              className="w-5 h-5 rounded hover:bg-[#e8e4df] flex items-center justify-center text-[#8a857f] hover:text-[#1a1a1a] transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg className="w-4 h-4 text-[#8a857f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 w-72 bg-white rounded-xl border border-[#e8e4df] shadow-lg shadow-black/10 overflow-hidden animate-in fade-in duration-150 ${
            flipUp
              ? 'bottom-full mb-1 slide-in-from-bottom-1'
              : 'top-full mt-1 slide-in-from-top-1'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-[#e8e4df]/60">
            <button
              type="button"
              onClick={prevMonth}
              className="w-8 h-8 rounded-lg hover:bg-[#f0ebe5] flex items-center justify-center text-[#8a857f] hover:text-[#1a1a1a] transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-[#1a1a1a]">
              {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="w-8 h-8 rounded-lg hover:bg-[#f0ebe5] flex items-center justify-center text-[#8a857f] hover:text-[#1a1a1a] transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Days of week */}
          <div className="grid grid-cols-7 gap-0 px-2 pt-2">
            {dayNames.map((day) => (
              <div key={day} className="h-8 flex items-center justify-center text-[10px] font-medium text-[#8a857f] uppercase">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-0 p-2">
            {days.map((day, index) => (
              <div key={index} className="aspect-square p-0.5">
                {day !== null && (
                  <button
                    type="button"
                    onClick={() => selectDate(day)}
                    className={`w-full h-full rounded-lg text-sm font-medium transition-all flex items-center justify-center ${
                      isSelected(day)
                        ? 'bg-[#d4a574] text-white'
                        : isToday(day)
                        ? 'bg-[#f0ebe5] text-[#d4a574] font-semibold'
                        : 'text-[#1a1a1a] hover:bg-[#f8f6f4]'
                    }`}
                  >
                    {day}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 p-2 border-t border-[#e8e4df]/60">
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                onChange(today);
                setIsOpen(false);
              }}
              className="flex-1 py-1.5 text-xs font-medium text-[#8a857f] hover:text-[#1a1a1a] hover:bg-[#f8f6f4] rounded-lg transition-all"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                onChange(tomorrow.toISOString().split('T')[0]);
                setIsOpen(false);
              }}
              className="flex-1 py-1.5 text-xs font-medium text-[#8a857f] hover:text-[#1a1a1a] hover:bg-[#f8f6f4] rounded-lg transition-all"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => {
                const nextWeek = new Date();
                nextWeek.setDate(nextWeek.getDate() + 7);
                onChange(nextWeek.toISOString().split('T')[0]);
                setIsOpen(false);
              }}
              className="flex-1 py-1.5 text-xs font-medium text-[#8a857f] hover:text-[#1a1a1a] hover:bg-[#f8f6f4] rounded-lg transition-all"
            >
              Next Week
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
