
import React, { useState } from "react";
import DownloadAppDialog from "@/components/pwa/DownloadAppDialog";
import { Instagram, Linkedin, Twitter, Facebook, ArrowRight } from "lucide-react";

const FooterSection = () => {
  const currentYear = new Date().getFullYear();
  const [downloadOpen, setDownloadOpen] = useState(false);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Newsletter signup logic here
    alert("Thank you for signing up for our newsletter!");
  };

  return (
    <footer id="contact" className="bg-gray-900 dark:bg-gray-950 text-white relative overflow-hidden">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="space-y-4">
            <div className="flex items-center">
              <img 
                src="/lovable-uploads/525fd30a-476a-4e14-ae55-ec2b11d54013.png" 
                alt="Cydex Logo" 
                className="h-10 w-auto invert" // Invert the black logo to white
              />
            </div>
            <p className="text-gray-400 max-w-xs">
              Revolutionary eco-friendly delivery platform transforming logistics with sustainability at its core.
            </p>
            <div className="flex space-x-4">
              <a href="https://www.instagram.com/cydexlogistics" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary">
                <Instagram size={20} />
              </a>
              <a href="https://www.linkedin.com/company/cydexlogistics" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary">
                <Linkedin size={20} />
              </a>
              <a href="https://x.com/cydexlogistics" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary">
                <Twitter size={20} />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <a href="/about" className="text-gray-400 hover:text-primary transition-colors">
                  About Us
                </a>
              </li>
              <li>
                <a href="/how-it-works" className="text-gray-400 hover:text-primary transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="/faq" className="text-gray-400 hover:text-primary transition-colors">
                  FAQs
                </a>
              </li>
              <li>
                <a href="/contact" className="text-gray-400 hover:text-primary transition-colors">
                  Contact Us
                </a>
              </li>
              <li>
                <button type="button" onClick={() => setDownloadOpen(true)} className="text-gray-400 hover:text-primary transition-colors">
                  Download App
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-4">Support</h4>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-gray-400 hover:text-primary transition-colors">
                  FAQ
                </a>
              </li>
              <li>
                <a href="/privacy-policy" className="text-gray-400 hover:text-primary transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-primary transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="/contact" className="text-gray-400 hover:text-primary transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-4">Newsletter</h4>
            <p className="text-gray-400 mb-4">
              Stay updated with our latest news and sustainable initiatives.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <input
                  type="email"
                  placeholder="Your email address"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                <button
                  type="submit"
                  className="absolute right-1 top-1 bg-primary hover:bg-primary-hover text-black rounded-lg p-2 transition-colors"
                >
                  <ArrowRight size={20} />
                </button>
              </div>
              <p className="text-xs text-gray-500">
                By subscribing, you agree to our Privacy Policy.
              </p>
            </form>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-500 text-sm">
            © {currentYear} Cydex. All rights reserved.
          </p>
          <div className="mt-4 md:mt-0">
            <a href="#" className="text-sm text-gray-500 hover:text-primary transition-colors">
              Made with sustainability in mind.
            </a>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mb-32 -mr-32 blur-3xl"></div>
      <DownloadAppDialog open={downloadOpen} onOpenChange={setDownloadOpen} />
    </footer>
  );
};

export default FooterSection;
