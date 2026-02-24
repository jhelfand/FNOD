import React from 'react';

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ children, className = '', ...rest }) => (
  <label className={`${className} text-sm`} {...rest}>{children}</label>
);

export default Label;
