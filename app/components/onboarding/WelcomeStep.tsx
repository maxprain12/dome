'use client';

import { useState } from 'react';
import { validateEmail, validateName } from '@/lib/utils/validation';

interface WelcomeStepProps {
  initialName?: string;
  initialEmail?: string;
  onComplete: (data: { name: string; email: string }) => void;
}

export default function WelcomeStep({ initialName = '', initialEmail = '', onComplete }: WelcomeStepProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { name?: string; email?: string } = {};

    if (!validateName(name)) {
      newErrors.name = 'Please enter a valid name (at least 2 characters)';
    }

    if (!validateEmail(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onComplete({ name: name.trim(), email: email.trim() });
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (errors.name && validateName(value)) {
      setErrors((prev) => ({ ...prev, name: undefined }));
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (errors.email && validateEmail(value)) {
      setErrors((prev) => ({ ...prev, email: undefined }));
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--primary-text)' }}>
            Welcome to Dome
          </h1>
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            Let's get started by setting up your profile
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--primary-text)' }}
            >
              Full Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="John Doe"
              className="w-full px-4 py-2.5 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--primary-text)',
                border: errors.name ? '1px solid #ef4444' : '1px solid var(--border)',
              }}
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--primary-text)' }}
            >
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="john@example.com"
              className="w-full px-4 py-2.5 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--primary-text)',
                border: errors.email ? '1px solid #ef4444' : '1px solid var(--border)',
              }}
            />
            {errors.email && (
              <p className="text-xs text-red-500 mt-1">{errors.email}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg font-medium text-sm text-white transition-colors"
            style={{
              backgroundColor: 'var(--accent)',
            }}
          >
            Continue
          </button>
        </form>

        <p className="text-xs text-center mt-6" style={{ color: 'var(--secondary-text)' }}>
          This information is stored locally and never shared
        </p>
      </div>
    </div>
  );
}
