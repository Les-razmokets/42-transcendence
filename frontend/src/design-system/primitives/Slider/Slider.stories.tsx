import type { Meta, StoryObj } from '@storybook/react-vite';
import { Slider } from './Slider';
import { useState } from 'react';


const meta: Meta<typeof Slider> = {
  title: 'Affichage/Slider',
  component: Slider,
  args: {  }
};
export default meta;
type Story = StoryObj<typeof Slider>;

function SliderDemo() {
  const [valeur, setValeur] = useState(200);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span className="typo-affiche-titre">{valeur} CHF</span>
      <Slider
        valeur={valeur} min={100} max={300} step={10} onChange={setValeur}
        libelle="Montant du buy-in" texteValeur={`${valeur} CHF`}
        texteMin="Min 100 CHF" texteMax="Max 300 CHF"
      />
    </div>
  );
}

export const BuyIn: Story = { render: () => <SliderDemo /> };