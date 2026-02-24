'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Input, Badge } from '@/components/ui';
import {
  Shield,
  FileText,
  Download,
  CheckCircle,
  Clock,
  Building2,
  Mail,
  User,
  Send,
} from 'lucide-react';

const securityDocs = [
  {
    id: 'soc2-type2',
    title: 'SOC 2 Type II Report',
    description: 'Independent audit of security, availability, and confidentiality controls',
    lastUpdated: '2024-03-01',
    requiresNDA: true,
  },
  {
    id: 'pentest',
    title: 'Penetration Test Report',
    description: 'Annual third-party security assessment by NCC Group',
    lastUpdated: '2024-02-15',
    requiresNDA: true,
  },
  {
    id: 'security-whitepaper',
    title: 'Security Whitepaper',
    description: 'Comprehensive overview of DeepTerm security architecture',
    lastUpdated: '2024-03-10',
    requiresNDA: false,
  },
  {
    id: 'encryption',
    title: 'Encryption Documentation',
    description: 'Technical details of end-to-end encryption implementation',
    lastUpdated: '2024-01-20',
    requiresNDA: false,
  },
];

const complianceBadges = [
  { name: 'SOC 2 Type II', status: 'certified', date: '2024' },
  { name: 'GDPR', status: 'compliant', date: '2024' },
  { name: 'HIPAA', status: 'compliant', date: '2024' },
  { name: 'ISO 27001', status: 'in-progress', date: 'Q2 2024' },
];

export default function SecurityAssessmentPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    documents: [] as string[],
    message: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);

  const toggleDocument = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.includes(id)
        ? prev.documents.filter((d) => d !== id)
        : [...prev.documents, id],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Requesting documents:', formData);
    setIsSubmitted(true);
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
            <div className="w-16 h-16 bg-accent-secondary/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-accent-secondary" />
            </div>
            <h2 className="text-2xl font-bold text-text-primary mb-4">
              Request Submitted
            </h2>
            <p className="text-text-secondary mb-6 max-w-md mx-auto">
              Our security team will review your request and send the requested
              documents within 1-2 business days.
            </p>
            <Button variant="secondary" onClick={() => setIsSubmitted(false)}>
              Submit Another Request
            </Button>
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            Security Assessment
          </h1>
          <p className="text-text-secondary">
            Request security documentation for your compliance requirements
          </p>
        </div>

        {/* Compliance Badges */}
        <Card className="mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-accent-primary/20 rounded-lg">
              <Shield className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Compliance Status
              </h2>
              <p className="text-sm text-text-secondary">
                Current certifications and compliance standards
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {complianceBadges.map((badge) => (
              <div
                key={badge.name}
                className={`p-4 rounded-lg border ${
                  badge.status === 'certified'
                    ? 'bg-accent-secondary/10 border-accent-secondary/30'
                    : badge.status === 'compliant'
                    ? 'bg-accent-primary/10 border-accent-primary/30'
                    : 'bg-yellow-500/10 border-yellow-500/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {badge.status === 'in-progress' ? (
                    <Clock className="w-4 h-4 text-yellow-500" />
                  ) : (
                    <CheckCircle
                      className={`w-4 h-4 ${
                        badge.status === 'certified'
                          ? 'text-accent-secondary'
                          : 'text-accent-primary'
                      }`}
                    />
                  )}
                  <span className="font-medium text-text-primary">
                    {badge.name}
                  </span>
                </div>
                <p className="text-xs text-text-secondary">
                  {badge.status === 'in-progress'
                    ? `Expected ${badge.date}`
                    : `Verified ${badge.date}`}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Available Documents */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Available Documents
            </h2>
            <div className="space-y-3">
              {securityDocs.map((doc) => (
                <Card
                  key={doc.id}
                  className={`cursor-pointer transition-all ${
                    formData.documents.includes(doc.id)
                      ? 'border-accent-primary bg-accent-primary/5'
                      : 'hover:border-border'
                  }`}
                  onClick={() => toggleDocument(doc.id)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        formData.documents.includes(doc.id)
                          ? 'bg-accent-primary border-accent-primary'
                          : 'border-text-tertiary'
                      }`}
                    >
                      {formData.documents.includes(doc.id) && (
                        <CheckCircle className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-text-tertiary" />
                        <h3 className="font-medium text-text-primary">
                          {doc.title}
                        </h3>
                        {doc.requiresNDA && (
                          <Badge variant="warning" className="text-xs">
                            NDA Required
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary">
                        {doc.description}
                      </p>
                      <p className="text-xs text-text-tertiary mt-1">
                        Last updated: {doc.lastUpdated}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Request Form */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Request Information
            </h2>
            <Card>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Full Name"
                  placeholder="Your name"
                  icon={<User className="w-5 h-5" />}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
                <Input
                  label="Work Email"
                  type="email"
                  placeholder="you@company.com"
                  icon={<Mail className="w-5 h-5" />}
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
                <Input
                  label="Company"
                  placeholder="Your company name"
                  icon={<Building2 className="w-5 h-5" />}
                  value={formData.company}
                  onChange={(e) =>
                    setFormData({ ...formData, company: e.target.value })
                  }
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    className="w-full bg-background-tertiary border border-border rounded-button px-4 py-2.5 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary min-h-[100px]"
                    placeholder="Any specific requirements or questions..."
                    value={formData.message}
                    onChange={(e) =>
                      setFormData({ ...formData, message: e.target.value })
                    }
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={formData.documents.length === 0}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Request Documents
                </Button>

                {formData.documents.length === 0 && (
                  <p className="text-sm text-text-tertiary text-center">
                    Select at least one document to continue
                  </p>
                )}
              </form>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
