'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Input, Badge } from '@/components/ui';
import {
  GraduationCap,
  CheckCircle,
  Mail,
  Building2,
  Calendar,
  Upload,
  AlertCircle,
  Gift,
  Zap,
  Clock,
} from 'lucide-react';

const benefits = [
  {
    title: 'Free Pro Plan',
    description: 'Full access to all Pro features while you study',
    icon: Zap,
  },
  {
    title: 'Extended Trial',
    description: '12-month subscription, renewable annually',
    icon: Calendar,
  },
  {
    title: 'All Platforms',
    description: 'Available on macOS. Windows, Linux, iOS, and Android coming soon',
    icon: Gift,
  },
];

export default function StudentsPage() {
  const [formData, setFormData] = useState({
    email: '',
    institution: '',
    graduationYear: '',
    studentId: '',
  });
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [status] = useState<'pending' | 'verified' | 'rejected' | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting student verification:', formData, verificationFile);
    setIsSubmitted(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVerificationFile(e.target.files[0]);
    }
  };

  if (isSubmitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="text-center py-12">
            <div className="w-16 h-16 bg-accent-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Clock className="w-8 h-8 text-accent-primary" />
            </div>
            <h2 className="text-2xl font-bold text-text-primary mb-4">
              Verification Pending
            </h2>
            <p className="text-text-secondary mb-6 max-w-md mx-auto">
              We&apos;re reviewing your application. You&apos;ll receive an email within
              2-3 business days confirming your student status.
            </p>
            <div className="flex items-center justify-center gap-2 text-text-tertiary">
              <Mail className="w-4 h-4" />
              <span className="text-sm">Check your inbox at {formData.email}</span>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-accent-primary" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            DeepTerm for Students
          </h1>
          <p className="text-text-secondary max-w-lg mx-auto">
            Get free access to DeepTerm Pro while you&apos;re studying. Build your
            skills with professional-grade tools.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {benefits.map((benefit, index) => {
            const BenefitIcon = benefit.icon;
            return (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <Card className="text-center h-full">
                  <div className="p-3 bg-accent-primary/20 rounded-xl w-fit mx-auto mb-3">
                    <BenefitIcon className="w-6 h-6 text-accent-primary" />
                  </div>
                  <h3 className="font-semibold text-text-primary mb-1">
                    {benefit.title}
                  </h3>
                  <p className="text-sm text-text-secondary">
                    {benefit.description}
                  </p>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Status Card (if previously submitted) */}
        {status && (
          <Card
            className={`mb-8 ${
              status === 'verified'
                ? 'border-accent-secondary/50 bg-accent-secondary/10'
                : status === 'rejected'
                ? 'border-accent-danger/50 bg-accent-danger/10'
                : 'border-yellow-500/50 bg-yellow-500/10'
            }`}
          >
            <div className="flex items-center gap-3">
              {status === 'verified' ? (
                <CheckCircle className="w-6 h-6 text-accent-secondary" />
              ) : status === 'rejected' ? (
                <AlertCircle className="w-6 h-6 text-accent-danger" />
              ) : (
                <Clock className="w-6 h-6 text-yellow-500" />
              )}
              <div>
                <h3 className="font-semibold text-text-primary">
                  {status === 'verified'
                    ? 'Student Status Verified'
                    : status === 'rejected'
                    ? 'Verification Failed'
                    : 'Verification Pending'}
                </h3>
                <p className="text-sm text-text-secondary">
                  {status === 'verified'
                    ? 'You have full access to DeepTerm Pro'
                    : status === 'rejected'
                    ? 'Please contact support for assistance'
                    : 'Your application is being reviewed'}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Verification Form */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-accent-primary/20 rounded-lg">
              <GraduationCap className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Verify Your Student Status
              </h2>
              <p className="text-sm text-text-secondary">
                Use your school email or upload proof of enrollment
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="School Email Address"
              type="email"
              placeholder="you@university.edu"
              icon={<Mail className="w-5 h-5" />}
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
              helperText="Use your .edu email for instant verification"
            />

            <Input
              label="Institution Name"
              placeholder="e.g., Stanford University"
              icon={<Building2 className="w-5 h-5" />}
              value={formData.institution}
              onChange={(e) =>
                setFormData({ ...formData, institution: e.target.value })
              }
              required
            />

            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Expected Graduation Year"
                type="number"
                placeholder="2025"
                value={formData.graduationYear}
                onChange={(e) =>
                  setFormData({ ...formData, graduationYear: e.target.value })
                }
                required
              />
              <Input
                label="Student ID (Optional)"
                placeholder="e.g., 12345678"
                value={formData.studentId}
                onChange={(e) =>
                  setFormData({ ...formData, studentId: e.target.value })
                }
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Proof of Enrollment (Optional)
              </label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-accent-primary/50 transition-colors">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="hidden"
                  id="verification-file"
                />
                <label htmlFor="verification-file" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                  {verificationFile ? (
                    <p className="text-text-primary font-medium">
                      {verificationFile.name}
                    </p>
                  ) : (
                    <>
                      <p className="text-text-primary mb-1">
                        Drop your file here or{' '}
                        <span className="text-accent-primary">browse</span>
                      </p>
                      <p className="text-xs text-text-tertiary">
                        Student ID, enrollment letter, or class schedule (PDF,
                        JPG, PNG)
                      </p>
                    </>
                  )}
                </label>
              </div>
            </div>

            <div className="p-4 bg-background-tertiary rounded-lg">
              <p className="text-sm text-text-secondary">
                By applying, you confirm that you are currently enrolled as a
                student at an accredited educational institution. Misuse of this
                program may result in account termination.
              </p>
            </div>

            <Button type="submit" variant="primary" className="w-full">
              <CheckCircle className="w-4 h-4 mr-2" />
              Submit Verification
            </Button>
          </form>
        </Card>

        {/* FAQ */}
        <Card className="mt-8">
          <h2 className="font-semibold text-text-primary mb-4">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-text-primary mb-1">
                Who is eligible?
              </h3>
              <p className="text-sm text-text-secondary">
                Any student currently enrolled in a degree-granting program at
                an accredited institution (high school, college, university, or
                bootcamp).
              </p>
            </div>
            <div>
              <h3 className="font-medium text-text-primary mb-1">
                How long does verification take?
              </h3>
              <p className="text-sm text-text-secondary">
                If you use a .edu email, verification is usually instant.
                Otherwise, manual review takes 2-3 business days.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-text-primary mb-1">
                What happens when I graduate?
              </h3>
              <p className="text-sm text-text-secondary">
                Your student plan will convert to a free plan after graduation.
                You&apos;ll receive a 50% discount offer on Pro when you graduate.
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
