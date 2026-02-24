import React from 'react';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className = '', ...rest }, ref) => (
  <input
    ref={ref}
    className={`bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 ${className}`}
    {...rest}
  />
));

Input.displayName = 'Input';

export default Input;
