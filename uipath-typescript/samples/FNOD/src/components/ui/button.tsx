import React from 'react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'lg'; variant?: 'outline' }> = ({ children, className = '', size, variant, ...rest }) => {
  const sizeClass = size === 'lg' ? 'py-2 px-4' : 'py-1 px-3 text-sm';
  const variantClass = variant === 'outline' ? 'border bg-transparent' : 'bg-blue-600 text-white';
  return (
    <button className={`${sizeClass} rounded ${variantClass} ${className}`} {...rest}>
      {children}
    </button>
  );
};

export default Button;
