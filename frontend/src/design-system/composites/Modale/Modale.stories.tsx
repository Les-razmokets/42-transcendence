import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Modale } from './Modale';
import { Bouton } from '../../primitives/Bouton';
import { LigneInfo } from '../../composites/LigneInfo';
import { Bandes } from '../../primitives/Bandes';

const meta: Meta<typeof Modale> = {
  title: 'Affichage/Modale',
  component: Modale,
};
export default meta;
type Story = StoryObj<typeof Modale>;

function AnnulerReservation() {
  const [ouvert, setOuvert] = useState(false);
  function annuler() {
    console.log("res annuler");
    setOuvert(false);
  }
  return (
    <>
      <Bouton variante="secondaire" onClick={() => setOuvert(true)}>Annuler</Bouton>

      <Modale
        open={ouvert}
        onClose={() => setOuvert(false)}
        title='Annuler la réservation ?'
        beforeTitle={<Bandes variante='fine'/>}
        actions={
            <>
                <Bouton variante='secondaire' onClick={() => setOuvert(false)}>Garder ma place</Bouton>
                <Bouton variante='accent' onClick={annuler}>Annuler la réservation</Bouton>
            </>
        }
      >
        <dl style={{display: 'flex', gap: 16, flexDirection: 'column'}}>
            <LigneInfo libelle='Casino' valeur="Casino de montreux"/>
            <LigneInfo libelle='Date' valeur="Ven. 16 oct"/>
        </dl>
        <p>Annulation gratuite</p>

      </Modale>
    </>
  );
}

export const Annulation: Story = { render: () => <AnnulerReservation /> };